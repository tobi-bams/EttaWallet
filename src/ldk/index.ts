import { err, ok, Result } from '../utils/result';
//@ts-ignore
import * as electrum from 'rn-electrum-client/helpers';
import {
  getBlockHeader,
  getBlockHex,
  getScriptPubKeyHistory,
  broadcastTransaction,
} from '../utils/electrum';
import lm, {
  DefaultTransactionDataShape,
  EEventTypes,
  TChannelManagerClaim,
  TChannelUpdate,
  TInvoice,
  TTransactionData,
  TTransactionPosition,
  TUserConfig,
} from '@synonymdev/react-native-ldk';
import ldk from '@synonymdev/react-native-ldk/dist/ldk';
import {
  updateLdkVersion,
  updateLdkNodeId,
  setLdkStoragePath,
  getLdkAccount,
  updateLightningChannels,
  updateClaimableBalance,
  getLightningStore,
  addPayment,
} from '../utils/lightning/helpers';
import { TLightningNodeVersion } from '../utils/types';
import { EmitterSubscription, InteractionManager } from 'react-native';
import { promiseTimeout, sleep, tryNTimes } from '../utils/helpers';
import { getBestBlock, getTransactionMerkle } from '../utils/electrum/helpers';
import { getLdkNetwork, TAvailableNetworks } from '../utils/networks';
import { getReceiveAddress, getSelectedNetwork, getWalletStore } from '../utils/wallet';

let LDKIsStayingSynced = false;

// Subscribe to LDK module events
let paymentSubscription: EmitterSubscription | undefined;
let onChannelSubscription: EmitterSubscription | undefined;

/**
 * Syncs LDK to the current height.
 * @returns {Promise<Result<string>>}
 */
export const refreshLdk = async ({
  selectedNetwork,
}: {
  selectedNetwork?: TAvailableNetworks;
}): Promise<Result<string>> => {
  try {
    // wait for the bells and whistles to finish
    await new Promise((resolve) => InteractionManager.runAfterInteractions(() => resolve(null)));

    if (!selectedNetwork) {
      selectedNetwork = getSelectedNetwork();
    }

    const isRunning = await isLdkRunning();
    if (!isRunning) {
      // Not up, attempt to reset LDK
      await resetLdk();
      // run fresh ldk setup; no need to refresh(sync) at this time.
      const setupResponse = await setupLdk({ selectedNetwork, shouldRefreshLdk: false });
      if (setupResponse.isErr()) {
        return err(setupResponse.error.message);
      }
      // keep synced every 2mins(default or define frequency param)
      keepLdkSynced({}).then();
    }
    const syncResponse = await lm.syncLdk();
    if (syncResponse.isErr()) {
      return err(syncResponse.error.message);
    }

    await updateLightningChannels();
    await updateClaimableBalance({ selectedNetwork });
    return ok('');
  } catch (e) {
    return err(`@refreshLdk ${e}`);
  }
};

export const resetLdk = async (): Promise<Result<string>> => {
  // wait for interactions/animations to be completed
  await new Promise((resolve) => InteractionManager.runAfterInteractions(() => resolve(null)));

  return await ldk.reset();
};

/**
 * Check if LDK is running.
 * @returns {Promise<boolean>}
 */
export const isLdkRunning = async (): Promise<boolean> => {
  const getNodeIdResponse = await promiseTimeout<Result<string>>(2000, getNodeId());
  if (getNodeIdResponse.isOk()) {
    return true;
  } else {
    return false;
  }
};

/**
 * Pauses execution until LDK is setup.
 * @returns {Promise<void>}
 */
export const waitForLdk = async (): Promise<void> => {
  await tryNTimes({
    toTry: getNodeId,
    interval: 500,
  });
};

/**
 * Attempts to keep LDK in sync every 2-minutes.
 * @param {number} frequency
 */
export const keepLdkSynced = async ({
  frequency = 120000,
  selectedNetwork,
}: {
  frequency?: number;
  selectedNetwork?: TAvailableNetworks;
}): Promise<void> => {
  if (LDKIsStayingSynced) {
    return;
  } else {
    LDKIsStayingSynced = true;
  }

  if (!selectedNetwork) {
    selectedNetwork = getSelectedNetwork();
  }

  let error: string = '';
  while (!error) {
    const syncRes = await refreshLdk({ selectedNetwork });

    if (!syncRes) {
      error = 'Could not refresh LDK.';
      LDKIsStayingSynced = false;
      break;
    }
    await sleep(frequency);
  }
};

/**
 * Returns the current LDK node id.
 * @returns {Promise<Result<string>>}
 */
export const getNodeId = async (): Promise<Result<string>> => {
  try {
    return await ldk.nodeId();
  } catch (e) {
    return err(e);
  }
};

/**
 * Returns LDK and c-bindings version.
 * @returns {Promise<Result<TLightningNodeVersion>}
 */
export const getNodeVersion = (): Promise<Result<TLightningNodeVersion>> => {
  return ldk.version();
};

const defaultUserConfig: TUserConfig = {
  channel_handshake_config: {
    announced_channel: false,
    minimum_depth: 1,
    max_htlc_value_in_flight_percent_of_channel: 100,
  },
  manually_accept_inbound_channels: false,
  accept_inbound_channels: true, // to allow zero conf
  accept_intercept_htlcs: true, // required by Voltage LSP Flow2.0? // LDK versions prior to 0.0.113 not supported
};

/**
 * Used to spin-up LDK services.
 * In order, this method:
 * 1. Fetches and sets the genesis hash.
 * 2. Retrieves and sets the seed from storage.
 * 3. Starts ldk with the necessary params.
 * 4. Syncs LDK.
 */
export const setupLdk = async ({
  selectedNetwork,
  shouldRefreshLdk = true,
}: {
  selectedNetwork: TAvailableNetworks;
  shouldRefreshLdk?: boolean;
}): Promise<Result<string>> => {
  try {
    if (!selectedNetwork) {
      selectedNetwork = getSelectedNetwork();
    }
    // start from clean slate
    await resetLdk();

    const account = await getLdkAccount();
    if (account.isErr()) {
      console.log('@setupLdk/getLdkAccount', account.error.message);
      return err(account.error.message);
    }

    const _getAddress = async (): Promise<string> => {
      // return a valid receive address for the selected network
      const res = await getReceiveAddress({ selectedNetwork });
      if (res) {
        return res;
      }
      return '';
    };

    const _broadcastTransaction = async (rawTx: string): Promise<string> => {
      const res = await broadcastTransaction({
        rawTx,
        selectedNetwork,
        subscribeToOutputAddress: false,
      });
      if (res.isErr()) {
        return '';
      }
      return res.value;
    };

    const storageRes = await setLdkStoragePath();
    if (storageRes.isErr()) {
      return err(storageRes.error);
    }

    // derive fees from updated state
    const fees = getWalletStore().fees;

    // start the lightning manager
    const lmStart = await lm.start({
      account: account.value,
      getFees: () =>
        Promise.resolve({
          highPriority: fees.fast,
          normal: fees.normal,
          background: fees.slow,
        }),
      network: getLdkNetwork(selectedNetwork),
      getBestBlock,
      getAddress: _getAddress,
      broadcastTransaction: _broadcastTransaction,
      getTransactionData: (txId) => _getTransactionData(txId, selectedNetwork),
      getScriptPubKeyHistory: (scriptPubkey) => {
        return getScriptPubKeyHistory(scriptPubkey, selectedNetwork);
      },
      getTransactionPosition: (params) => {
        return getTransactionPosition({ ...params, selectedNetwork });
      },
      userConfig: defaultUserConfig,
    });
    if (lmStart.isErr()) {
      return err(`@lmStart: ${lmStart.error.message}`);
    }

    // Grab node id and add it to state
    const nodeIdRes = await ldk.nodeId();
    if (nodeIdRes.isErr()) {
      return err(nodeIdRes.error.message);
    }
    await Promise.all([
      await updateLdkNodeId({
        nodeId: nodeIdRes.value,
      }),
      // also update ldk node version in state
      updateLdkVersion(),
      // removeUnusedPeers({ selectedWallet, selectedNetwork }),
    ]);
    // if yes, start sync
    if (shouldRefreshLdk) {
      await refreshLdk({ selectedNetwork });
    }

    // subscribe to events from LDK
    subscribeToPayments({ selectedNetwork });

    return ok(`LDK NodeID: ${nodeIdRes.value}`);
  } catch (e) {
    return err(e.toString());
  }
};

/**
 * Returns the transaction header, height and hex (transaction) for a given txid.
 * @param {string} txId
 * @param {TAvailableNetworks} [selectedNetwork]
 * @returns {Promise<TTransactionData>}
 */
export const _getTransactionData = async (
  txId: string = '',
  selectedNetwork?: TAvailableNetworks
): Promise<TTransactionData> => {
  let transactionData = DefaultTransactionDataShape;
  try {
    const data = {
      key: 'tx_hash',
      data: [
        {
          tx_hash: txId,
        },
      ],
    };

    if (selectedNetwork) {
      selectedNetwork = getSelectedNetwork();
    }

    const response = await electrum.getTransactions({
      txHashes: data,
      network: selectedNetwork,
    });

    if (response.error || !response.data || response.data[0].error) {
      console.log(
        `@getTransactions: something ain't right: ${JSON.stringify(response.data[0].error.message)}`
      );
      return transactionData;
    }

    const { confirmations, hex: hex_encoded_tx, vout } = response.data[0].result;
    const header = getBlockHeader();
    const currentHeight = header.height;
    let confirmedHeight = 0;
    if (confirmations) {
      confirmedHeight = currentHeight - confirmations + 1;
    }
    const hexEncodedHeader = await getBlockHex({
      height: confirmedHeight,
      selectedNetwork,
    });
    if (hexEncodedHeader.isErr()) {
      return transactionData;
    }
    const voutData = vout.map(({ n, value, scriptPubKey: { hex } }) => {
      return { n, hex, value };
    });
    return {
      header: hexEncodedHeader.value,
      height: confirmedHeight,
      transaction: hex_encoded_tx,
      vout: voutData,
    };
  } catch {
    return transactionData;
  }
};

/**
 * Returns the position/index of the provided tx_hash within a block.
 * @param {string} tx_hash
 * @param {number} height
 * @returns {Promise<number>}
 */
export const getTransactionPosition = async ({
  tx_hash,
  height,
  selectedNetwork,
}: {
  tx_hash: string;
  height: number;
  selectedNetwork?: TAvailableNetworks;
}): Promise<TTransactionPosition> => {
  const response = await getTransactionMerkle({
    tx_hash,
    height,
    selectedNetwork,
  });
  if (response.error || isNaN(response.data?.pos) || response.data?.pos < 0) {
    return -1;
  }
  return response.data.pos;
};

/**
 * Iterates over watch transactions for spends. Sets them as confirmed as needed.
 * @returns {Promise<boolean>}
 */

export const checkWatchTxs = async (): Promise<boolean> => {
  const checkedScriptPubKeys: string[] = [];
  const watchTransactionIds = lm.watchTxs.map((tx) => tx.txid);
  for (const watchTx of lm.watchTxs) {
    if (!checkedScriptPubKeys.includes(watchTx.script_pubkey)) {
      const scriptPubKeyHistory: { txid: string; height: number }[] = await getScriptPubKeyHistory(
        watchTx.script_pubkey
      );
      for (const data of scriptPubKeyHistory) {
        if (!watchTransactionIds.includes(data?.txid)) {
          const txData = await _getTransactionData(data?.txid);
          await ldk.setTxConfirmed({
            header: txData.header,
            height: txData.height,
            txData: [{ transaction: txData.transaction, pos: 0 }],
          });
          return true;
        }
      }
      checkedScriptPubKeys.push(watchTx.script_pubkey);
    }
  }
  return false;
};

/**
 * Retrieves any pending/unpaid invoices from the invoices array via payment hash.
 * @param {string} paymentHash
 * @param {TAvailableNetworks} [selectedNetwork]
 */
export const getPendingInvoice = ({
  paymentHash,
  selectedNetwork,
}: {
  paymentHash: string;
  selectedNetwork?: TAvailableNetworks;
}): Result<TInvoice> => {
  try {
    if (!selectedNetwork) {
      selectedNetwork = getSelectedNetwork();
    }
    const invoices = getLightningStore().invoices;
    const invoice = invoices.filter((inv) => inv.payment_hash === paymentHash);
    if (invoice.length > 0) {
      return ok(invoice[0]);
    }
    return err('Unable to find any pending invoices.');
  } catch (e) {
    return err(e);
  }
};

export const handlePaymentSubscription = async ({
  payment,
  selectedNetwork,
}: {
  payment: TChannelManagerClaim;
  selectedNetwork?: TAvailableNetworks;
}): Promise<void> => {
  if (!selectedNetwork) {
    selectedNetwork = getSelectedNetwork();
  }
  console.log('Receiving Lightning Payment...', payment);
  const invoice = getPendingInvoice({
    paymentHash: payment.payment_hash,
    selectedNetwork,
  });
  if (invoice.isOk()) {
    addPayment({
      invoice: invoice.value,
      selectedNetwork,
    });
    // Show new payment received toast
    // showBottomSheet('newTxPrompt', {
    //   txId: invoice.value.payment_hash,
    // });
    // closeBottomSheet('receiveNavigation');
    console.info('new payment received', invoice.value.payment_hash);
    await refreshLdk({ selectedNetwork });
  }
};

/**
 * Subscribes to incoming lightning payments.
 * @param {TAvailableNetworks} [selectedNetwork]
 */
export const subscribeToPayments = ({
  selectedNetwork,
}: {
  selectedNetwork?: TAvailableNetworks;
}): void => {
  if (!selectedNetwork) {
    selectedNetwork = getSelectedNetwork();
  }
  if (!paymentSubscription) {
    paymentSubscription = ldk.onEvent(
      EEventTypes.channel_manager_payment_claimed,
      (res: TChannelManagerClaim) => {
        handlePaymentSubscription({
          payment: res,
          selectedNetwork,
        }).then();
      }
    );
  }
  if (!onChannelSubscription) {
    onChannelSubscription = ldk.onEvent(EEventTypes.new_channel, (_res: TChannelUpdate) => {
      // TODO: channel not open yet, change toast text or remove
      // showSuccessNotification({
      //   title: i18n.t('lightning:channel_opened_title'),
      //   message: i18n.t('lightning:channel_opened_msg'),
      // });
      console.info('channel opened successfully. Make this a toast');
      refreshLdk({ selectedNetwork }).then();
    });
  }
};

export const unsubscribeFromLDKSubscriptions = (): void => {
  paymentSubscription?.remove();
  onChannelSubscription?.remove();
};
