import { Action, action, Thunk, thunk } from 'easy-peasy';
import {
  EPaymentType,
  NodeState,
  TContact,
  TLightningNodeVersion,
  TLightningPayment,
  TModifyInvoice,
} from '../../utils/types';
import { TChannel, TInvoice } from '@synonymdev/react-native-ldk';
import { startLightning } from '../../utils/lightning/helpers';
import logger from '../../utils/logger';
import { isLdkRunning, waitForLdk } from '../../ldk';

const TAG = 'LightningStore';

// @TODO: add translatable strings to error and success messages

export interface LightningNodeModelType {
  ldkState: NodeState;
  nodeId: string | null;
  nodeStarted: boolean;
  ldkVersion: TLightningNodeVersion;
  channels: { [key: string]: TChannel };
  openChannelIds: string[];
  invoices: TInvoice[];
  payments: { [key: string]: TLightningPayment };
  peers: string[];
  contacts: TContact[];
  claimableBalance: number;
  maxReceivable: number;
  defaultPRDescription: string;
  defaultPRExpiry: number;
  setDefaultPRDescription: Action<LightningNodeModelType, string>;
  setDefaultPRExpiry: Action<LightningNodeModelType, number>;
  setNodeId: Action<LightningNodeModelType, string>;
  setNodeStarted: Action<LightningNodeModelType, boolean>;
  startLdk: Thunk<LightningNodeModelType>;
  setLdkState: Action<LightningNodeModelType, NodeState>;
  setLdkVersion: Action<LightningNodeModelType, TLightningNodeVersion>;
  addInvoice: Action<LightningNodeModelType, TInvoice>;
  updateInvoice: Action<LightningNodeModelType, TModifyInvoice>;
  removeInvoice: Action<LightningNodeModelType, string>;
  updateInvoices: Action<LightningNodeModelType, { index: number; invoice: TInvoice }>;
  updateChannels: Action<LightningNodeModelType, Partial<LightningNodeModelType>>;
  updateClaimableBalance: Action<LightningNodeModelType, number>;
  setMaxReceivable: Action<LightningNodeModelType, number>;
  removeExpiredInvoices: Action<LightningNodeModelType, TInvoice[]>;
  addPayment: Action<LightningNodeModelType, TLightningPayment>;
  updatePayment: Action<LightningNodeModelType, TLightningPayment>;
  addPeer: Action<LightningNodeModelType, string>;
  addContact: Action<LightningNodeModelType, TContact>;
  updateContact: Action<LightningNodeModelType, { contactId: string; updatedContact: TContact }>;
  deleteContact: Action<LightningNodeModelType, string>;
  deleteContactAddress: Action<LightningNodeModelType, { contactId: string; addressId: string }>;
}

export const lightningModel: LightningNodeModelType = {
  ldkState: NodeState.OFFLINE,
  nodeStarted: false,
  nodeId: null,
  ldkVersion: {
    ldk: '',
    c_bindings: '',
  },
  channels: {},
  invoices: [],
  payments: {},
  peers: [],
  contacts: [],
  openChannelIds: [],
  claimableBalance: 0,
  maxReceivable: 0,
  defaultPRDescription: 'Invoice from EttaWallet',
  defaultPRExpiry: 604800, // 1 week
  setDefaultPRDescription: action((state, payload) => {
    state.defaultPRDescription = payload;
  }),
  setDefaultPRExpiry: action((state, payload) => {
    state.defaultPRExpiry = payload;
  }),
  setNodeId: action((state, payload) => {
    state.nodeId = payload;
  }),
  setLdkVersion: action((state, payload) => {
    state.ldkVersion = payload;
  }),
  startLdk: thunk(async () => {
    try {
      // check if LDK is up
      const isLdkUp = await isLdkRunning();
      // if nuh, start all lightning services (testnet)
      if (!isLdkUp) {
        await startLightning({});
        // check for node ID
        await waitForLdk();
      }
    } catch (error) {
      logger.error(TAG, '@startLdk', error.message);
    }
  }),
  setLdkState: action((state, payload) => {
    state.ldkState = payload;
    if (payload === NodeState.COMPLETE) {
      state.nodeStarted = true;
    }
  }),
  setNodeStarted: action((state, payload) => {
    state.nodeStarted = payload;
  }),
  addInvoice: action((state, payload) => {
    state.invoices.push(payload);
  }),
  updateInvoice: action((state, payload) => {
    // updates invoice, usually tags, notes or contacts
    state.invoices = state.invoices.map((invoice) =>
      invoice.payment_hash === payload?.payment_hash
        ? { ...invoice, to_str: payload?.modified_request }
        : invoice
    );
  }),
  removeInvoice: action((state, payload) => {
    const index = state.invoices.findIndex((invoice) => invoice.payment_hash === payload);
    if (index !== -1) {
      state.invoices.splice(index, 1);
    }
  }),
  updateInvoices: action((state, payload) => {
    state.invoices[payload.index] = payload.invoice;
  }),
  removeExpiredInvoices: action((state) => {
    // get number of secs since unix epoch at this time
    const nowInSecs = Math.floor(Date.now() / 1000);
    // keep only those invoices whose timestamp + expiry exceeds now in unix epoch
    state.invoices = state.invoices.filter(
      (invoice) => invoice.timestamp + invoice.expiry_time > nowInSecs
    );
  }),
  updateChannels: action((state, payload) => {
    state.channels = {
      ...state.channels,
      ...(payload?.channels ?? {}),
    };
    // check if channel already exists in openChannelIDs array
    const newChannelIds = payload?.openChannelIds ?? [];
    const uniqueIds = newChannelIds.filter((id) => !state.openChannelIds.includes(id));
    state.openChannelIds = [...state.openChannelIds, ...uniqueIds];
  }),
  updateClaimableBalance: action((state, payload) => {
    state.claimableBalance = payload;
  }),
  setMaxReceivable: action((state, payload) => {
    state.maxReceivable = payload;
  }),
  addPayment: action((state, payload) => {
    state.payments = {
      ...state.payments,
      [payload?.invoice.payment_hash]: {
        invoice: payload?.invoice,
        type:
          // if payee_pubkey matches the nodeId, save as received payment
          payload?.invoice.payee_pub_key === state.nodeId
            ? EPaymentType.received
            : EPaymentType.sent,
      },
    };
  }),
  updatePayment: action((state, payload) => {
    // updates invoice, usually tags, notes or contacts
    try {
      const payment = Object.values(state.payments).filter(
        (p) => p.invoice.payment_hash === payload.invoice.payment_hash
      )[0];
      if (payment) {
        Object.assign(payment, payload);
      }
    } catch (e) {
      console.log(e.message);
    }
  }),
  addPeer: action((state, payload) => {
    state.peers.push(payload);
  }),
  addContact: action((state, payload) => {
    state.contacts.push(payload);
  }),
  updateContact: action((state, payload) => {
    const { contactId, updatedContact } = payload;
    if (contactId && updatedContact) {
      state.contacts = state.contacts.map((contact) => {
        if (contact.id === contactId) {
          // update identifiers
          const mergedIdentifiers = updatedContact.identifiers
            ? [...(contact.identifiers || []), ...updatedContact.identifiers]
            : contact.identifiers || [];
          return {
            ...contact,
            ...updatedContact,
            identifiers: mergedIdentifiers,
          };
        }
        return contact;
      });
    }
  }),
  deleteContact: action((state, payload) => {
    const index = state.contacts.findIndex((contact) => contact.id === payload);
    if (index !== -1) {
      state.contacts.splice(index, 1);
    }
  }),
  deleteContactAddress: action((state, payload) => {
    const { contactId, addressId } = payload;
    state.contacts = state.contacts.map((contact) => {
      if (contact.id === contactId) {
        const updatedIdentifiers = contact.identifiers!.filter(
          (identity) => identity.id !== addressId
        );
        return { ...contact, identifiers: updatedIdentifiers };
      }
      return contact;
    });

    state.contacts = state.contacts.map((contact) => {
      const updatedIdentifiers = contact.identifiers!.filter(
        (identity) => identity.id !== addressId
      );
      return { ...contact, items: updatedIdentifiers };
    });
  }),
};
