// @flow
/*
    Pillar Wallet: the personal data locker
    Copyright (C) 2019 Stiftung Pillar Project

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation; either version 2 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License along
    with this program; if not, write to the Free Software Foundation, Inc.,
    51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
*/
import React, { useCallback, useEffect, useState } from 'react';
import { connect } from 'react-redux';
import { Keyboard } from 'react-native';
import debounce from 'lodash.debounce';
import get from 'lodash.get';
import isEmpty from 'lodash.isempty';
import { createStructuredSelector } from 'reselect';
import { getEnv } from 'configs/envConfig';
import t from 'translations/translate';

// components
import Button from 'components/Button';
import { BaseText } from 'components/Typography';
import Spinner from 'components/Spinner';
import RelayerMigrationModal from 'components/RelayerMigrationModal';
import FeeLabelToggle from 'components/FeeLabelToggle';
import { Spacing } from 'components/Layout';
import SendContainer from 'containers/SendContainer';
import Toast from 'components/Toast';
import ContactDetailsModal from 'components/ContactDetailsModal';

// utils
import { isValidNumber, getEthereumProvider } from 'utils/common';
import { spacing } from 'utils/variables';
import { getBalance, isEnoughBalanceForTransactionFee } from 'utils/assets';
import { buildTxFeeInfo } from 'utils/smartWallet';
import { getContactWithEnsName } from 'utils/contacts';
import { isEnsName } from 'utils/validators';

// services
import { buildERC721TransactionData } from 'services/assets';
import smartWalletService from 'services/smartWallet';
import { firebaseRemoteConfig } from 'services/firebase';

// selectors
import { isGasTokenSupportedSelector, useGasTokenSelector } from 'selectors/smartWallet';
import { activeAccountAddressSelector, contactsSelector } from 'selectors';
import { visibleActiveAccountAssetsWithBalanceSelector } from 'selectors/assets';
import { activeAccountMappedCollectiblesSelector } from 'selectors/collectibles';

// types
import type { NavigationScreenProp } from 'react-navigation';
import type { TokenTransactionPayload, Transaction, TransactionFeeInfo } from 'models/Transaction';
import type {
  Balances,
  Assets,
  AssetData,
} from 'models/Asset';
import type { RootReducerState, Dispatch } from 'reducers/rootReducer';
import type { SessionData } from 'models/Session';
import type { Option } from 'models/Selector';
import type { Contact } from 'models/Contact';

// constants
import { SEND_COLLECTIBLE_CONFIRM, SEND_TOKEN_CONFIRM } from 'constants/navigationConstants';
import { ETH, COLLECTIBLES } from 'constants/assetsConstants';
import { FEATURE_FLAGS } from 'constants/featureFlagsConstants';

// actions
import { addContactAction } from 'actions/contactsActions';
import { estimateTransactionAction } from 'actions/transactionEstimateActions';
import type { AccountTransaction } from 'services/smartWallet';


type Props = {
  defaultContact: ?Contact,
  source: string,
  navigation: NavigationScreenProp<*>,
  balances: Balances,
  session: SessionData,
  activeAccountAddress: string,
  accountAssets: Assets,
  accountHistory: Transaction[],
  isGasTokenSupported: boolean,
  useGasToken: boolean,
  assetsWithBalance: Option[],
  collectibles: Option[],
  contacts: Contact[],
  addContact: (contact: Contact) => void,
  feeInfo: ?TransactionFeeInfo,
  isEstimating: boolean,
  estimateErrorMessage: ?string,
  estimateTransaction: (transaction: AccountTransaction, assetData?: AssetData) => void,
};

const SendEthereumTokens = ({
  source,
  navigation,
  balances,
  session,
  activeAccountAddress,
  accountAssets,
  accountHistory,
  isGasTokenSupported,
  useGasToken,
  assetsWithBalance,
  collectibles,
  contacts,
  addContact,
  defaultContact,
  feeInfo,
  isEstimating,
  estimateErrorMessage,
  estimateTransaction,
}: Props) => {
  const [showRelayerMigrationModal, setShowRelayerMigrationModal] = useState(false);
  const hideRelayerMigrationModal = () => setShowRelayerMigrationModal(false);

  useEffect(() => {
    if (isGasTokenSupported && showRelayerMigrationModal) {
      hideRelayerMigrationModal(); // hide on update
    }
  }, [isGasTokenSupported]);

  const defaultAssetData = navigation.getParam('assetData');
  const [assetData, setAssetData] = useState(defaultAssetData);

  const [amount, setAmount] = useState(null);
  const [inputHasError, setInputHasError] = useState(false);
  const [selectedContact, setSelectedContact] = useState(defaultContact);
  const [submitPressed, setSubmitPressed] = useState(false);
  const [resolvingContactEnsName, setResolvingContactEnsName] = useState(false);
  const [contactToAdd, setContactToAdd] = useState(null);
  const hideAddContactModal = () => setContactToAdd(null);
  const [forceHideSelectorModals, setForceHideSelectorModals] = useState(false);
  const [selectorModalsHidden, setSelectorModalsHidden] = useState(false);

  // parse value
  const currentValue = parseFloat(amount || 0);
  const isValidAmount = !!amount && isValidNumber(currentValue.toString()); // method accepts value as string

  const updateTxFee = async (specifiedAmount?: number) => {
    const value = Number(specifiedAmount || amount || 0);
    const isCollectible = get(assetData, 'tokenType') === COLLECTIBLES;

    // specified amount is always valid and not necessarily matches input amount
    if ((!specifiedAmount && !isValidAmount) || value === 0 || !assetData || !selectedContact) {
      return;
    }

    let data;
    if (isCollectible) {
      const provider = getEthereumProvider(getEnv().COLLECTIBLES_NETWORK);
      const {
        name,
        id,
        contractAddress,
        tokenType,
      } = assetData;
      const collectibleTransaction = {
        from: activeAccountAddress,
        to: selectedContact.ethAddress,
        receiverEnsName: selectedContact.ensName,
        name,
        tokenId: id,
        contractAddress,
        tokenType,
      };
      data = await buildERC721TransactionData(collectibleTransaction, provider);
    }

    estimateTransaction({ recipient: selectedContact.ethAddress, value, data }, assetData);
  };

  const updateTxFeeDebounced = useCallback(
    debounce(updateTxFee, 500),
    [amount, selectedContact, useGasToken, assetData],
  );

  useEffect(() => {
    updateTxFeeDebounced();
    return updateTxFeeDebounced.cancel;
  }, [updateTxFeeDebounced]);

  const handleAmountChange = (value: ?Object) => {
    if (amount !== value?.input) setAmount(value?.input || '0');
    if (value && assetData !== value.selector) setAssetData(value.selector);
  };

  useEffect(() => {
    if (!defaultAssetData) return;

    let formattedSelectedAsset;
    if (assetData.tokenType === COLLECTIBLES) {
      formattedSelectedAsset = collectibles.find(({ tokenId }) => assetData.id === tokenId);
    } else {
      formattedSelectedAsset = assetsWithBalance.find(({ token }) => assetData.token === token);
    }

    if (!formattedSelectedAsset) return;

    handleAmountChange({ selector: formattedSelectedAsset, input: '' });
  }, []);

  const resolveAndSetContactAndFromOption = async (
    value: Option,
    setContact: (value: ?Contact) => void,
    onSuccess?: () => void,
  ): Promise<void> => {
    const ethAddress = value?.ethAddress || '';
    let contact = {
      name: value?.name || '',
      ethAddress,
      ensName: null,
    };

    if (isEnsName(ethAddress)) {
      setResolvingContactEnsName(true);
      contact = await getContactWithEnsName(contact, ethAddress);
      if (!contact?.ensName) {
        // failed to resolve ENS, error toast will be shown
        setResolvingContactEnsName(false);
        return Promise.resolve();
      }
      setResolvingContactEnsName(false);
    }

    // if name still empty let's set it with address
    if (isEmpty(contact.name)) contact = { ...contact, name: contact.ethAddress };

    setContact(contact);

    if (onSuccess) onSuccess();

    return Promise.resolve();
  };

  const handleReceiverSelect = (value: Option, onSuccess?: () => void) => {
    if (!value?.ethAddress) {
      setSelectedContact(null);
      if (onSuccess) onSuccess();
    } else {
      resolveAndSetContactAndFromOption(value, setSelectedContact, onSuccess);
    }
  };

  const manageFormErrorState = (errorMessage: ?string) => {
    const newErrorState = !!errorMessage;
    if (inputHasError !== newErrorState) setInputHasError(newErrorState);
  };

  const handleFormSubmit = async () => {
    if (submitPressed || !feeInfo || !amount || !selectedContact || !assetData) return;

    setSubmitPressed(true);

    if (assetData.tokenType === COLLECTIBLES) {
      setSubmitPressed(false);
      navigation.navigate(SEND_COLLECTIBLE_CONFIRM, {
        assetData,
        receiver: selectedContact.ethAddress,
        source,
        receiverEnsName: selectedContact.ensName,
      });
      return;
    }

    // $FlowFixMe
    const transactionPayload: TokenTransactionPayload = {
      to: selectedContact.ethAddress,
      receiverEnsName: selectedContact.ensName,
      amount,
      txFeeInWei: feeInfo.fee,
      symbol: assetData.token,
      contractAddress: assetData.contractAddress,
      decimals: assetData.decimals,
    };

    if (feeInfo?.gasToken) transactionPayload.gasToken = feeInfo.gasToken;

    Keyboard.dismiss();
    setSubmitPressed(false);
    navigation.navigate(SEND_TOKEN_CONFIRM, {
      transactionPayload,
      source,
    });
  };

  const calculateBalancePercentTxFee = async (assetSymbol: string, percentageModifier: number) => {
    const maxBalance = parseFloat(getBalance(balances, assetSymbol));
    const calculatedBalanceAmount = maxBalance * percentageModifier;

    // update fee only on max balance
    if (maxBalance === calculatedBalanceAmount) {
      // not debounced call to make sure it's not cancelled
      await updateTxFee(calculatedBalanceAmount);
    }
  };

  const renderRelayerMigrationButton = () => (
    <Button
      title={t('transactions.button.payFeeWithPillar')}
      onPress={() => setShowRelayerMigrationModal(true)}
      secondary
      small
    />
  );

  const token = get(assetData, 'token');
  const preselectedCollectible = get(assetData, 'tokenType') === COLLECTIBLES ? get(assetData, 'id') : '';

  // balance
  const balance = getBalance(balances, token);

  const enteredMoreThanBalance = currentValue > balance;
  const hasAllFeeData = !isEstimating && !estimateErrorMessage && !!selectedContact;

  const showFeeForAsset = !enteredMoreThanBalance && hasAllFeeData && isValidAmount;
  const showFeeForCollectible = hasAllFeeData;
  const isCollectible = get(assetData, 'tokenType') === COLLECTIBLES;
  const showFee = isCollectible ? showFeeForCollectible : showFeeForAsset;

  const showRelayerMigration = firebaseRemoteConfig.getBoolean(FEATURE_FLAGS.APP_FEES_PAID_WITH_PLR)
    && showFee
    && !isGasTokenSupported;

  const hasAllData = isCollectible
    ? (!!selectedContact && !!assetData)
    : (!inputHasError && !!selectedContact && !!currentValue);

  const enoughBalanceForTransaction = feeInfo
    && assetData
    && isValidAmount
    && isEnoughBalanceForTransactionFee(balances, {
      txFeeInWei: feeInfo.fee,
      gasToken: feeInfo.gasToken,
      decimals: assetData.decimals,
      amount,
      symbol: token,
    });

  const errorMessage = !enoughBalanceForTransaction
    ? t('error.notEnoughTokenForFeeExtended', { token: feeInfo?.gasToken?.symbol || ETH })
    : estimateErrorMessage;

  const renderFee = () => {
    if (isEstimating) {
      return <Spinner width={20} height={20} />;
    }

    return (
      <>
        {!!showFee && !!feeInfo && <FeeLabelToggle txFeeInWei={feeInfo?.fee} gasToken={feeInfo?.gasToken} />}
        {!!errorMessage && <BaseText center secondary>{errorMessage}</BaseText>}
        {showRelayerMigration && (
          <>
            <Spacing h={spacing.medium} />
            {renderRelayerMigrationButton()}
          </>
        )}
      </>
    );
  };

  const showNextButton = !isEstimating && hasAllData && enoughBalanceForTransaction;

  const isNextButtonDisabled = !session.isOnline;

  const contactsAsOptions = contacts.map((contact) => ({ ...contact, value: contact.ethAddress }));
  const addContactButtonPress = (option: Option) => resolveAndSetContactAndFromOption(
    option,
    setContactToAdd,
    () => setForceHideSelectorModals(true),
  );
  const customOptionButtonOnPress = !resolvingContactEnsName
    ? addContactButtonPress
    : () => {};
  const selectedOption: ?Option = selectedContact
    ? { ...selectedContact, value: selectedContact.ethAddress }
    : null;

  return (
    <SendContainer
      customSelectorProps={{
        onOptionSelect: !resolvingContactEnsName && !contactToAdd ? handleReceiverSelect : () => {},
        options: contactsAsOptions,
        selectedOption,
        customOptionButtonLabel: t('button.addToContacts'),
        customOptionButtonOnPress,
        resetOptionsModalOnHiddenOptionAdded: true,
        hideModals: forceHideSelectorModals,
        onModalsHidden: () => {
          // force hide selector modals to show contact add modal
          if (contactToAdd) {
            setSelectorModalsHidden(true);
          }
        },
      }}
      customValueSelectorProps={{
        getFormValue: handleAmountChange,
        getError: manageFormErrorState,
        txFeeInfo: feeInfo,
        preselectedAsset: token,
        preselectedCollectible,
        showAllAssetTypes: true,
        gettingFee: isEstimating,
        hideMaxSend: isEstimating || !selectedContact, // we cannot calculate max if no receiver is set
        calculateBalancePercentTxFee,
      }}
      footerProps={{
        isNextButtonVisible: showNextButton,
        buttonProps: {
          onPress: handleFormSubmit,
          isLoading: submitPressed,
          disabled: isNextButtonDisabled,
        },
        footerTopAddon: !!selectedContact && renderFee({
          showFee,
          isLoading: isEstimating,
          feeError: estimateErrorMessage,
        }),
      }}
    >
      {showRelayerMigration &&
        <RelayerMigrationModal
          isVisible={showRelayerMigrationModal}
          onModalHide={hideRelayerMigrationModal}
          accountAssets={accountAssets}
          accountHistory={accountHistory}
        />
      }
      <ContactDetailsModal
        title={t('title.addNewContact')}
        isVisible={!isEmpty(contactToAdd) && selectorModalsHidden}
        contact={contactToAdd}
        onSavePress={(contact: Contact) => {
          hideAddContactModal();
          addContact(contact);
          handleReceiverSelect({ ...contact, value: contact.ethAddress });
        }}
        onModalHide={hideAddContactModal}
        onModalHidden={() => {
          setSelectorModalsHidden(false);
          setForceHideSelectorModals(false);
        }}
        contacts={contacts}
        isDefaultNameEns
      />
    </SendContainer>
  );
};

const mapStateToProps = ({
  transactionEstimate: {
    estimated,
    isEstimating,
    errorMessage: estimateErrorMessage,
  },
}: RootReducerState): $Shape<Props> => ({
  feeInfo: estimated?.feeInfo,
  isEstimating,
  estimateErrorMessage,
});

const structuredSelector = createStructuredSelector({
  activeAccountAddress: activeAccountAddressSelector,
  isGasTokenSupported: isGasTokenSupportedSelector,
  useGasToken: useGasTokenSelector,
  assetsWithBalance: visibleActiveAccountAssetsWithBalanceSelector,
  collectibles: activeAccountMappedCollectiblesSelector,
  contacts: contactsSelector,
});

const combinedMapStateToProps = (state: RootReducerState): $Shape<Props> => ({
  ...structuredSelector(state),
  ...mapStateToProps(state),
});

const mapDispatchToProps = (dispatch: Dispatch): $Shape<Props> => ({
  addContact: (contact: Contact) => dispatch(addContactAction(contact)),
  estimateTransaction: (
    transaction: AccountTransaction,
    assetData?: AssetData,
  ) => dispatch(estimateTransactionAction(transaction, assetData)),
});

export default connect(combinedMapStateToProps, mapDispatchToProps)(SendEthereumTokens);
