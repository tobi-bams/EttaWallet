import React, { useLayoutEffect } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { SettingsItemWithTextValue } from '../../components/InfoListItem';
import { HeaderTitleWithSubtitle, headerWithBackButton } from '../../navigation/Headers';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStoreState } from '../../state/hooks';
import Clipboard from '@react-native-clipboard/clipboard';
import { showToast } from '../../utils/alerts';
import { cueInformativeHaptic } from '../../utils/accessibility/haptics';
import { maskString } from '../../utils/helpers';
import { navigate } from '../../navigation/NavigationService';
import { Screens } from '../../navigation/Screens';
import SectionTitle from '../../components/SectionTitle';
import useLightningSettingsBottomSheet from './useLightningSettingsBottomSheet';

const LightningSettingsScreen = ({ navigation }) => {
  const nodeID = useStoreState((state) => state.lightning.nodeId);
  const maskedNodeId = maskString(nodeID!, 10);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => <HeaderTitleWithSubtitle title="Lightning network" />,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const {
    openUpdateDescriptionSheet,
    openUpdateExpirySheet,
    updateDescriptionBottomSheet,
    updateExpiryBottomSheet,
    openElectrumSheet,
    showElectrumBottomSheet,
  } = useLightningSettingsBottomSheet();

  const onPressNodeId = () => {
    Clipboard.setString(nodeID || '');
    showToast({
      message: 'Node ID copied to clipboard',
    });
    cueInformativeHaptic();
  };

  const onPressChannels = () => {
    cueInformativeHaptic();
    navigate(Screens.ChannelsScreen);
  };

  const onPressViewLogs = () => {
    cueInformativeHaptic();
    navigate(Screens.LogsScreen);
  };

  return (
    <SafeAreaView style={styles.container}>
      <SectionTitle title="Defaults" style={styles.sectionHeading} />
      <SettingsItemWithTextValue
        title="Default payment description"
        withChevron={true}
        onPress={openUpdateDescriptionSheet}
      />
      <SettingsItemWithTextValue
        title="Default invoice expiry period"
        withChevron={true}
        onPress={openUpdateExpirySheet}
      />
      <SectionTitle title="Advanced" style={styles.sectionHeading} />
      <SettingsItemWithTextValue
        title="Node ID"
        value={maskedNodeId}
        withChevron={false}
        onPress={onPressNodeId}
      />
      <SettingsItemWithTextValue
        title="Payment Channels"
        withChevron={true}
        onPress={onPressChannels}
      />
      <SettingsItemWithTextValue title="Peers" withChevron={true} onPress={onPressChannels} />
      <SettingsItemWithTextValue
        title="Electrum servers"
        withChevron={true}
        onPress={openElectrumSheet}
      />
      <SettingsItemWithTextValue
        title="View LDK logs"
        withChevron={true}
        onPress={onPressViewLogs}
      />
      {updateDescriptionBottomSheet}
      {updateExpiryBottomSheet}
      {showElectrumBottomSheet}
    </SafeAreaView>
  );
};

LightningSettingsScreen.navigationOptions = {
  ...headerWithBackButton,
  ...Platform.select({
    ios: { animation: 'slide_from_bottom' },
  }),
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  text: {
    textAlign: 'center',
  },
  sectionHeading: {
    marginTop: 20,
    marginBottom: 8,
  },
});

export default LightningSettingsScreen;
