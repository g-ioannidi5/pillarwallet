// @flow
import ethers from 'ethers';
import { NavigationActions } from 'react-navigation';
import firebase from 'react-native-firebase';
import { delay } from 'utils/common';
import Intercom from 'react-native-intercom';
import ChatService from 'services/chat';
import { getSaltedPin } from 'utils/wallet';
import {
  ENCRYPTING,
  GENERATE_ENCRYPTED_WALLET,
  GENERATING,
  UPDATE_WALLET_STATE,
  REGISTERING,
  USERNAME_EXISTS,
  USERNAME_OK,
  CHECKING_USERNAME,
  SET_API_USER,
} from 'constants/walletConstants';
import { APP_FLOW, NEW_WALLET, ASSETS } from 'constants/navigationConstants';
import { SET_INITIAL_ASSETS, UPDATE_ASSETS } from 'constants/assetsConstants';
import { UPDATE_CONTACTS } from 'constants/contactsConstants';
import { UPDATE_INVITATIONS } from 'constants/invitationsConstants';
import { UPDATE_APP_SETTINGS } from 'constants/appSettingsConstants';
import { UPDATE_RATES } from 'constants/ratesConstants';
import { PENDING, REGISTERED, UPDATE_USER } from 'constants/userConstants';
import { UPDATE_ACCESS_TOKENS } from 'constants/accessTokensConstants';
import { SET_HISTORY } from 'constants/historyConstants';
import { generateChatPassword } from 'utils/chat';
import Storage from 'services/storage';
import { navigate } from 'services/navigation';
import { getExchangeRates } from 'services/assets';

const storage = Storage.getInstance('db');
const chat = new ChatService();

export const registerWalletAction = () => {
  return async (dispatch: Function, getState: () => any, api: Object) => {
    const currentState = getState();
    const {
      mnemonic,
      pin,
      importedWallet,
      apiUser,
    } = currentState.wallet.onboarding;

    const mnemonicPhrase = mnemonic.original;

    // STEP 0: Clear local storage
    await storage.removeAll();
    dispatch({ type: UPDATE_CONTACTS, payload: [] });
    dispatch({ type: UPDATE_INVITATIONS, payload: [] });
    dispatch({ type: UPDATE_ASSETS, payload: {} });
    dispatch({ type: UPDATE_APP_SETTINGS, payload: {} });
    dispatch({ type: UPDATE_ACCESS_TOKENS, payload: [] });
    dispatch({ type: SET_HISTORY, payload: [] });

    // STEP 1: navigate to the new wallet screen
    navigate(NavigationActions.navigate({ routeName: NEW_WALLET }));
    await delay(50);

    // STEP 2: check if wallet was imported or create it from the mnemonic phrase otherwise
    let wallet = importedWallet;
    if (!wallet) {
      dispatch({
        type: UPDATE_WALLET_STATE,
        payload: GENERATING,
      });
      await delay(50);
      wallet = ethers.Wallet.fromMnemonic(mnemonicPhrase);
    }

    // STEP 3: encrypt the wallet
    dispatch({
      type: UPDATE_WALLET_STATE,
      payload: ENCRYPTING,
    });
    await delay(50);
    const saltedPin = getSaltedPin(pin);
    const encryptedWallet = await wallet.RNencrypt(saltedPin, { scrypt: { N: 16384 } })
      .then(JSON.parse)
      .catch(() => ({}));

    await storage.save('wallet', { wallet: encryptedWallet });
    await storage.save('app_settings', { appSettings: { wallet: +new Date() } });
    const user = apiUser.username ? { username: apiUser.username } : {};
    await storage.save('user', { user });
    dispatch({
      type: GENERATE_ENCRYPTED_WALLET,
      payload: wallet,
    });

    // STEP 4: Initialize SDK annd register user
    dispatch({
      type: UPDATE_WALLET_STATE,
      payload: REGISTERING,
    });
    api.init(wallet.privateKey);
    await firebase.messaging().requestPermission().catch(() => { });
    const fcmToken = await firebase.messaging().getToken().catch(() => { });
    await Intercom.sendTokenToIntercom(fcmToken);
    const sdkWallet = await api.registerOnBackend(fcmToken, user.username);
    const registrationSucceed = !!Object.keys(sdkWallet).length;
    const userInfo = await api.userInfo(sdkWallet.walletId);
    await chat.init({
      userId: sdkWallet.userId,
      username: user.username,
      password: generateChatPassword(wallet.privateKey),
      walletId: sdkWallet.walletId,
      ethAddress: wallet.address,
    }).catch(() => null);
    await chat.client.registerAccount().catch(() => null);
    await chat.client.setFcmId(fcmToken).catch(() => null);
    if (Object.keys(userInfo).length) {
      await storage.save('user', { user: userInfo }, true);
    }
    const userState = Object.keys(userInfo).length ? REGISTERED : PENDING;
    dispatch({
      type: UPDATE_USER,
      payload: {
        user: userInfo,
        state: userState,
      },
    });

    if (!registrationSucceed) {
      dispatch({
        type: UPDATE_WALLET_STATE,
        payload: sdkWallet.reason,
      });
      return;
    }

    // STEP 5: get&store initial assets
    const initialAssets = await api.fetchInitialAssets(userInfo.walletId);
    const rates = await getExchangeRates(Object.keys(initialAssets));

    dispatch({
      type: UPDATE_RATES,
      payload: rates,
    });

    dispatch({
      type: SET_INITIAL_ASSETS,
      payload: initialAssets,
    });

    await storage.save('assets', { assets: initialAssets });

    // STEP 6: all done, navigate to the assets screen
    const navigateToAssetsAction = NavigationActions.navigate({
      routeName: APP_FLOW,
      params: {},
      action: NavigationActions.navigate({ routeName: ASSETS }),
    });

    navigate(navigateToAssetsAction);
  };
};

export const registerOnBackendAction = () => {
  return async (dispatch: Function, getState: () => Object, api: Object) => {
    const { wallet: { data: wallet, onboarding: { apiUser } } } = getState();
    dispatch({
      type: UPDATE_WALLET_STATE,
      payload: REGISTERING,
    });
    let { user } = await storage.get('user');
    if (apiUser.username) {
      user = apiUser;
    }
    await delay(1000);
    api.init(wallet.privateKey);
    await firebase.messaging().requestPermission().catch(() => { });
    const fcmToken = await firebase.messaging().getToken().catch(() => { });
    await Intercom.sendTokenToIntercom(fcmToken);
    const sdkWallet = await api.registerOnBackend(fcmToken, user.username);
    const registrationSucceed = !sdkWallet.error;

    const userInfo = await api.userInfo(sdkWallet.walletId);
    if (Object.keys(userInfo).length) {
      await storage.save('user', { user: userInfo }, true);
    }
    const userState = Object.keys(userInfo).length ? REGISTERED : PENDING;
    dispatch({
      type: UPDATE_USER,
      payload: {
        user: userInfo,
        state: userState,
      },
    });

    if (!registrationSucceed) {
      dispatch({
        type: UPDATE_WALLET_STATE,
        payload: sdkWallet.reason,
      });
      return;
    }

    const navigateToAssetsAction = NavigationActions.navigate({
      routeName: APP_FLOW,
      params: {},
      action: NavigationActions.navigate({ routeName: ASSETS }),
    });

    navigate(navigateToAssetsAction);
  };
};

export const validateUserDetailsAction = ({ username }: Object) => {
  return async (dispatch: Function, getState: () => Object, api: Object) => {
    const currentState = getState();
    dispatch({
      type: UPDATE_WALLET_STATE,
      payload: CHECKING_USERNAME,
    });
    const { mnemonic, importedWallet } = currentState.wallet.onboarding;
    const mnemonicPhrase = mnemonic.original;
    await delay(200);
    let wallet = importedWallet;
    if (!wallet) {
      wallet = currentState.wallet.data.privateKey
        ? currentState.wallet.data
        : ethers.Wallet.fromMnemonic(mnemonicPhrase);
    }

    api.init(wallet.privateKey);
    const apiUser = await api.usernameSearch(username);
    const usernameExists = !!Object.keys(apiUser).length;
    const usernameStatus = usernameExists ? USERNAME_EXISTS : USERNAME_OK;
    dispatch({
      type: SET_API_USER,
      payload: usernameExists ? apiUser : { username },
    });
    dispatch({
      type: UPDATE_WALLET_STATE,
      payload: usernameStatus,
    });
  };
};
