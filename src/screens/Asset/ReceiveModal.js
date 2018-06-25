// @flow
import * as React from 'react';
import { Clipboard, Dimensions } from 'react-native';
import { SubTitle, TextLink, Label } from 'components/Typography';
import { baseColors } from 'utils/variables';
import styled from 'styled-components/native';
import SlideModal from 'components/Modals/SlideModal';
import Button from 'components/Button';
import QRCode from 'components/QRCode';

const window = Dimensions.get('window');

type Props = {
  address: string,
  onModalHide: Function,
  handleOpenShareDialog: Function,
  token: string,
  tokenName: string,
  isVisible: boolean,
}

type State = {
  isVisible: boolean,
  address: string,
  onModalHide: Function,
  token: string,
  tokenName: string,
}

const FooterWrapper = styled.View`
  flexDirection: column;
  justify-content: space-around;
  align-items: center;
  padding: 0 10px;
  width: 100%;
`;

const ContentWrapper = styled.View`
  height: ${window.height / 2};
  justify-content: space-around;
`;

const TouchableOpacity = styled.TouchableOpacity`
  padding-top: 10px;
`;

const Holder = styled.View`
  display: flex;
  flex-direction:column;
  justify-content: space-around;
  align-items: center;
`;

export default class ReceiveModal extends React.Component<Props, State> {
  state = {
    isVisible: false,
    address: '',
    onModalHide: () => { },
    token: '',
    tokenName: '',
  }

  static getDerivedStateFromProps(props: Props) {
    return {
      isVisible: props.isVisible,
      address: props.address,
      onModalHide: props.onModalHide,
      token: props.token,
      tokenName: props.tokenName,
    };
  }

  handleAddressClipboardSet = () => {
    const {
      address,
    } = this.state;
    Clipboard.setString(address);
  };

  handleAddressShare = () => {
    const {
      handleOpenShareDialog,
      address,
    } = this.props;

    handleOpenShareDialog(address);
  };

  render() {
    const {
      isVisible,
      address,
      token,
      tokenName,
      onModalHide,
    } = this.state;

    return (
      <SlideModal title="receive" isVisible={isVisible} onModalHide={onModalHide}>
        <SubTitle>Share your wallet address to receive {tokenName} ({token})</SubTitle>
        <ContentWrapper>
          <Holder>
            <QRCode value={address} blockHeight={5} />
            <Button title="Share Address" onPress={this.handleAddressShare} />
          </Holder>
          <Holder>
            <FooterWrapper>
              <Label color={baseColors.slateBlack}>{address}</Label>
              <TouchableOpacity onPress={this.handleAddressClipboardSet}>
                <TextLink>Copy wallet address to clipboard</TextLink>
              </TouchableOpacity>
            </FooterWrapper>
          </Holder>
        </ContentWrapper>
      </SlideModal>
    );
  }
}
