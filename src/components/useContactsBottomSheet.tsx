/* eslint-disable @typescript-eslint/no-unused-vars */
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetTextInput,
  useBottomSheetDynamicSnapPoints,
} from '@gorhom/bottom-sheet';
import { Button, Colors, Icon, TypographyPresets } from 'etta-ui';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  cueErrorHaptic,
  cueInformativeHaptic,
  cueSuccessHaptic,
} from '../utils/accessibility/haptics';
import FormTextInput from './form/TextInput';
import store from '../state/store';
import { TContact } from '../utils/types';
import { v4 as uuidv4 } from 'uuid';
import { navigate } from '../navigation/NavigationService';
import { Screens } from '../navigation/Screens';
import { showErrorBanner, showSuccessBanner } from '../utils/alerts';
import { getLightningStore } from '../utils/lightning/helpers';
import { BottomSheetSearchInput } from './SearchInput';
import { sortContacts } from '../utils/helpers';
import ContactItem from './ContactItem';

interface Props {
  contact?: TContact;
}

const useContactsBottomSheet = (addressProps: Props) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const paddingBottom = Math.max(insets.bottom, 24);

  const newContactBottomSheetRef = useRef<BottomSheet>(null);
  const editContactBottomSheetRef = useRef<BottomSheet>(null);
  const contactMenuBottomSheetRef = useRef<BottomSheet>(null);
  const addAddressBottomSheetRef = useRef<BottomSheet>(null);
  const pickContactBottomSheetRef = useRef<BottomSheet>(null);

  const initialSnapPoints = useMemo(() => ['35%', 'CONTENT_HEIGHT'], []);
  const pickContactSnapPoints = useMemo(() => ['40%', '75%'], []);
  const { animatedHandleHeight, animatedSnapPoints, animatedContentHeight, handleContentLayout } =
    useBottomSheetDynamicSnapPoints(initialSnapPoints);

  const openNewContactSheet = () => {
    cueInformativeHaptic();
    newContactBottomSheetRef.current?.snapToIndex(0);
  };

  const openEditContactSheet = () => {
    cueInformativeHaptic();
    editContactBottomSheetRef.current?.snapToIndex(0);
  };

  const openContactMenuSheet = () => {
    cueInformativeHaptic();
    contactMenuBottomSheetRef.current?.snapToIndex(0);
  };

  const openAddAddressSheet = () => {
    cueInformativeHaptic();
    addAddressBottomSheetRef.current?.snapToIndex(0);
  };

  const openPickContactSheet = () => {
    cueInformativeHaptic();
    pickContactBottomSheetRef.current?.snapToIndex(0);
  };

  const renderBackdrop = useCallback(
    (props) => (
      // added opacity here, default is 0.5
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.1} />
    ),
    []
  );

  const updatingContact = addressProps?.contact;

  const [isLoading, setIsLoading] = useState(false);
  const [contactName, setContactName] = useState('');
  const [generatedContactId, setGeneratedContactId] = useState(uuidv4());
  const [generatedAddressId, setGeneratedAddressId] = useState(uuidv4());

  const [newAddress, setNewAddress] = useState('');
  const [newAddressLabel, setNewAddressLabel] = useState('');
  const [newContactName, setNewContactName] = useState(updatingContact?.alias!);
  const [searchText, setSearchText] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [allContacts, setAllContacts] = useState<TContact[]>([]);

  const NewContactBottomSheet = useMemo(() => {
    const onPressSave = () => {
      try {
        setIsLoading(true);
        const payload: TContact = {
          id: generatedContactId,
          alias: contactName.trim(),
          date_added: Date.now(),
        };
        store.dispatch.lightning.addContact(payload);
        setIsLoading(false);
        cueSuccessHaptic();
        newContactBottomSheetRef.current?.close();
        navigate(Screens.ContactDetailScreen, {
          contact: payload,
        });
      } catch (e) {
        console.log(e.message);
      }
    };

    return (
      <BottomSheet
        ref={newContactBottomSheetRef}
        index={-1}
        snapPoints={animatedSnapPoints}
        handleHeight={animatedHandleHeight}
        contentHeight={animatedContentHeight}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        handleIndicatorStyle={styles.handle}
      >
        <View style={[styles.container, { paddingBottom }]} onLayout={handleContentLayout}>
          <Text style={styles.title}>{t('Add new contact')}</Text>
          <FormTextInput
            onChangeText={setContactName}
            value={contactName}
            multiline={false}
            placeholder="Enter name or alias"
          />

          <Button
            title={isLoading ? 'Saving...' : 'Save'}
            size="default"
            iconPosition="left"
            icon="icon-sd-card"
            onPress={onPressSave}
            style={styles.button}
            disabled={!contactName || isLoading}
          />
        </View>
      </BottomSheet>
    );
  }, [
    animatedSnapPoints,
    animatedHandleHeight,
    animatedContentHeight,
    renderBackdrop,
    paddingBottom,
    handleContentLayout,
    t,
    contactName,
    isLoading,
    generatedContactId,
  ]);

  const EditContactBottomSheet = useMemo(() => {
    const onPressSave = () => {
      try {
        setIsLoading(true);
        if (updatingContact !== undefined) {
          const payload: TContact = {
            id: updatingContact.id,
            alias: newContactName.trim(),
          };
          store.dispatch.lightning.updateContact({
            contactId: updatingContact.id,
            updatedContact: payload,
          });
          setIsLoading(false);
          cueSuccessHaptic();
          editContactBottomSheetRef.current?.close();
          requestAnimationFrame(() => {
            navigate(Screens.ContactsScreen);
          });
        }
      } catch (e) {
        console.log(e.message);
      }
    };

    return (
      <BottomSheet
        ref={editContactBottomSheetRef}
        index={-1}
        snapPoints={animatedSnapPoints}
        handleHeight={animatedHandleHeight}
        contentHeight={animatedContentHeight}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        handleIndicatorStyle={styles.handle}
      >
        <View style={[styles.container, { paddingBottom }]} onLayout={handleContentLayout}>
          <Text style={styles.title}>{t('Change alias')}</Text>
          <FormTextInput
            onChangeText={setNewContactName}
            value={newContactName}
            multiline={false}
            placeholder="Enter name or alias"
          />

          <Button
            title={isLoading ? 'Saving...' : 'Save'}
            size="default"
            iconPosition="left"
            icon="icon-sd-card"
            onPress={onPressSave}
            style={styles.button}
            disabled={!newContactName || isLoading}
          />
        </View>
      </BottomSheet>
    );
  }, [
    animatedSnapPoints,
    animatedHandleHeight,
    animatedContentHeight,
    renderBackdrop,
    paddingBottom,
    handleContentLayout,
    t,
    isLoading,
    newContactName,
    updatingContact,
  ]);

  // useEffect(() => {
  //   const timer = setTimeout(() => {
  //     async function validateAddress() {
  //       const parsedInput = await parseInputAddress(newAddress);
  //       if (parsedInput?.data === 'Lightning address') {
  //         setValidationMsg('Lightning address');
  //       }
  //     }
  //     setIsValidating(true);
  //     validateAddress();
  //     setIsValidating(false);
  //   }, 1500); // Set the desired delay in milliseconds (e.g., 500ms)

  //   return () => clearTimeout(timer);
  // }, [newAddress]);

  const AddAddressBottomSheet = useMemo(() => {
    const onPressSave = () => {
      try {
        setIsLoading(true);
        if (updatingContact !== undefined) {
          const payload: TContact = {
            id: updatingContact.id,
            identifiers: [
              {
                id: generatedAddressId,
                label: newAddressLabel.trim(),
                address: newAddress.trim(),
              },
            ],
          };
          store.dispatch.lightning.updateContact({
            contactId: updatingContact.id,
            updatedContact: payload,
          });
          setIsLoading(false);
          Alert.alert('Saved', 'Contact was updated successfully');
          cueSuccessHaptic();
          addAddressBottomSheetRef.current?.close();
          requestAnimationFrame(() => {
            navigate(Screens.ContactsScreen);
          });
        }
      } catch (e) {
        cueErrorHaptic();
        console.log(e.message);
        showErrorBanner({
          title: 'Error',
          message: e.message,
        });
      }
    };

    return (
      <BottomSheet
        ref={addAddressBottomSheetRef}
        index={-1}
        snapPoints={animatedSnapPoints}
        handleHeight={animatedHandleHeight}
        contentHeight={animatedContentHeight}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        handleIndicatorStyle={styles.handle}
      >
        <View style={[styles.container, { paddingBottom }]} onLayout={handleContentLayout}>
          <Text style={styles.title}>{t('Add address')}</Text>
          <FormTextInput
            onChangeText={setNewAddressLabel}
            value={newAddressLabel}
            multiline={false}
            placeholder="Enter label"
            autoCapitalize="none"
          />
          <FormTextInput
            onChangeText={setNewAddress}
            value={newAddress}
            multiline={true}
            placeholder="Paste address"
            autoCapitalize="none"
            style={styles.addressInput}
          />
          {/* {newAddress !== '' && !isValidating ? (
            <Text>{validationMsg}</Text>
          ) : (
            <ActivityIndicator color={Colors.orange.base} size="small" />
          )} */}
          <Button
            title={isLoading ? 'Saving...' : 'Save address'}
            size="default"
            iconPosition="left"
            icon="icon-sd-card"
            onPress={onPressSave}
            style={styles.button}
            disabled={!newAddress || !newAddressLabel || isLoading}
          />
        </View>
      </BottomSheet>
    );
  }, [
    animatedSnapPoints,
    animatedHandleHeight,
    animatedContentHeight,
    renderBackdrop,
    paddingBottom,
    handleContentLayout,
    t,
    newAddressLabel,
    newAddress,
    isLoading,
    updatingContact,
    generatedAddressId,
  ]);

  const ContactMenuBottomSheet = useMemo(() => {
    const onPressAddAddress = () => {
      contactMenuBottomSheetRef.current?.close();
      openAddAddressSheet();
    };
    const onPressEditContact = () => {
      contactMenuBottomSheetRef.current?.close();
      openEditContactSheet();
    };
    const onPressDelete = () => {
      cueInformativeHaptic();
      contactMenuBottomSheetRef.current?.close();
      Alert.alert('Are you sure?', 'This contact will be deleted permanently', [
        {
          text: 'Delete',
          onPress: () => {
            cueErrorHaptic();
            try {
              setIsLoading(true);
              if (updatingContact !== undefined) {
                const payload = updatingContact?.id!;
                store.dispatch.lightning.deleteContact(payload);
                setIsLoading(false);
                showSuccessBanner({ message: 'Contact was deleted successfully' });
                cueSuccessHaptic();
                requestAnimationFrame(() => {
                  navigate(Screens.ContactsScreen);
                });
              }
            } catch (e) {
              cueErrorHaptic();
              console.log(e.message);
              showErrorBanner({
                title: 'Error',
                message: e.message,
              });
            }
          },
        },
        {
          text: 'Cancel',
          onPress: () => console.log('Delete contact action cancelled'),
          style: 'cancel',
        },
      ]);
    };

    return (
      <BottomSheet
        ref={contactMenuBottomSheetRef}
        index={-1}
        snapPoints={animatedSnapPoints}
        handleHeight={animatedHandleHeight}
        contentHeight={animatedContentHeight}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        handleIndicatorStyle={styles.handle}
      >
        <View style={[styles.container, { paddingBottom }]} onLayout={handleContentLayout}>
          <Button
            title="Add address"
            onPress={onPressAddAddress}
            style={styles.optButton}
            appearance="outline"
          />
          <Button
            title="Edit alias"
            onPress={onPressEditContact}
            style={styles.optButton}
            appearance="outline"
          />
          <Button
            title="Delete"
            onPress={onPressDelete}
            style={styles.optButton}
            appearance="outline"
          />
        </View>
      </BottomSheet>
    );
  }, [
    animatedSnapPoints,
    animatedHandleHeight,
    animatedContentHeight,
    renderBackdrop,
    paddingBottom,
    handleContentLayout,
    updatingContact,
  ]);

  function onSelect(contact: TContact) {
    console.log('selected: ', contact.id);
  }

  const renderItem = useCallback(
    ({ item: contact }: { item: TContact }) => (
      <ContactItem contact={contact} onSelect={onSelect} isSelected={false} />
    ),
    []
  );

  const renderItemSeparator = () => <View style={styles.separator} />;

  const keyExtractor = (item: TContact) => item.id;

  const filteredContacts = useMemo(() => {
    if (!searchText) {
      return allContacts;
    }

    const filtered = allContacts.filter((contact) =>
      contact.alias?.toLowerCase().includes(searchText.toLowerCase())
    );

    return filtered;
  }, [allContacts, searchText]);

  const refreshContacts = () => {
    setRefreshing(true);
    const contacts = getLightningStore().contacts;
    const sortedContacts = sortContacts(contacts);
    setAllContacts(sortedContacts);
    setRefreshing(false);
    return;
  };

  useEffect(() => {
    // get current contacts
    refreshContacts();
    console.log('refreshed contact list');
  }, []);

  const handleContactsRefresh = useCallback(() => {
    refreshContacts();
    console.log('refreshing contacts in bottomsheet');
  }, []);

  const PickContactBottomSheet = useMemo(() => {
    const NoContactsView = () => (
      <View style={styles.emptyView}>
        {searchText !== '' ? (
          <Text style={styles.emptyText}>{`No results found for ${searchText} `}</Text>
        ) : (
          <>
            <Text style={styles.emptyTitle}>Add your first contact</Text>
            <Text style={styles.emptyText}>
              Send and receive more easily, and keep your payments well organized.
            </Text>
            <View style={styles.btnContainer}>
              <Button title="Add contact" style={styles.button} onPress={openNewContactSheet} />
            </View>
          </>
        )}
      </View>
    );

    return (
      <BottomSheet
        ref={pickContactBottomSheetRef}
        index={-1}
        snapPoints={pickContactSnapPoints}
        handleHeight={animatedHandleHeight}
        contentHeight={animatedContentHeight}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        handleIndicatorStyle={styles.handle}
      >
        <View style={[styles.container, { paddingBottom }]} onLayout={handleContentLayout}>
          <View style={styles.pickContactContainer}>
            <Text style={styles.title}>Pick a contact</Text>
            <Icon name="icon-plus" onPress={openNewContactSheet} style={styles.addIcon} />
          </View>
          <BottomSheetSearchInput
            value={searchText}
            onChangeText={setSearchText}
            style={styles.searchBox}
          />
          <BottomSheetFlatList
            data={filteredContacts}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            contentContainerStyle={{ backgroundColor: Colors.common.white }}
            ItemSeparatorComponent={renderItemSeparator}
            ListEmptyComponent={NoContactsView}
            refreshing={false}
            onRefresh={handleContactsRefresh}
          />
        </View>
      </BottomSheet>
    );
  }, [
    pickContactSnapPoints,
    animatedHandleHeight,
    animatedContentHeight,
    renderBackdrop,
    paddingBottom,
    handleContentLayout,
    searchText,
    filteredContacts,
    renderItem,
    handleContactsRefresh,
  ]);

  return {
    openNewContactSheet,
    NewContactBottomSheet,
    openEditContactSheet,
    EditContactBottomSheet,
    openAddAddressSheet,
    AddAddressBottomSheet,
    openContactMenuSheet,
    ContactMenuBottomSheet,
    openPickContactSheet,
    PickContactBottomSheet,
  };
};

const styles = StyleSheet.create({
  handle: {
    backgroundColor: Colors.neutrals.light.neutral6,
  },
  container: {
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  title: {
    ...TypographyPresets.Header5,
    textAlign: 'left',
  },
  button: {
    justifyContent: 'center',
    marginVertical: 16,
  },
  optButton: {
    justifyContent: 'center',
    marginVertical: 5,
  },
  addressInput: {
    paddingHorizontal: 12,
    alignItems: 'flex-start',
    borderColor: Colors.neutrals.light.neutral3,
    borderRadius: 4,
    borderWidth: 1.5,
    color: Colors.common.black,
    height: 80,
    maxHeight: 150,
  },
  searchBox: {
    marginVertical: 10,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.neutrals.light.neutral4,
  },
  emptyView: {
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  emptyTitle: {
    ...TypographyPresets.Header5,
    textAlign: 'center',
    paddingBottom: 10,
  },
  emptyText: {
    ...TypographyPresets.Body4,
    color: Colors.neutrals.light.neutral7,
    textAlign: 'center',
  },
  btnContainer: {
    marginTop: 24,
  },
  addIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 18,
    color: Colors.common.black,
  },
  pickContactContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});

export default useContactsBottomSheet;
