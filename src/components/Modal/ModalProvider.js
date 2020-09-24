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

import React, { useContext } from 'react';
import type { Node as ReactNode } from 'react';
import { Keyboard } from 'react-native';

import Toast from 'components/Toast';
import { noop } from 'utils/common';

export type ModalOptions = {
  id: string,
  render: () => ReactNode,
};

type State = {|
  stack: ModalOptions[],
|};

type ModalInstance = {
  _close: () => Promise<void>,
};

const ModalStackContext = React.createContext<ModalOptions[]>([]);
const ModalNextIndexContext = React.createContext<number>(0);

// eslint-disable-next-line i18next/no-literal-string
export const ModalIdContext = React.createContext<string>('default value for modal id context');

export const ModalStack = () => {
  const stack = useContext(ModalStackContext);
  const index = useContext(ModalNextIndexContext);
  const options = stack[index];

  return (index < stack.length ? (
    <ModalNextIndexContext.Provider value={index + 1}>
      <ModalIdContext.Provider value={options.id}>
        {options.render()}
      </ModalIdContext.Provider>
    </ModalNextIndexContext.Provider>
  ) : null);
};

class ModalProvider extends React.Component<{}, State> {
  static _activeInstance: ModalProvider | null = null;
  static getInstance(): ModalProvider | null {
    return this._activeInstance;
  }

  state: State = {
    stack: [],
  }

  _idCounter = 0;
  modalInstances: Map<string, ModalInstance> = new Map();

  componentDidMount() {
    if (ModalProvider._activeInstance === null) {
      ModalProvider._activeInstance = this;
    }
  }

  componentWillUnmount() {
    if (ModalProvider._activeInstance === this) {
      ModalProvider._activeInstance = null;
    }
  }

  open = (options: ModalOptions) => {
    const id = (this._idCounter++).toString();
    this.setState({ stack: [...this.state.stack, { ...options, id }] });
  }

  close: (id: string) => void = (id: string) => {
    const { stack } = this.state;
    const index = stack.findIndex(({ id: _id }) => _id === id);
    const instance = this.modalInstances.get(id);
    if (!instance || !stack[index]) return;

    (async () => {
      Keyboard.dismiss();
      if (Toast.isVisible()) Toast.closeAll();

      // If this is the modal on top of the stack, close with animation before
      // removing from state. The other case shouldn't happen, so while we make
      // sure the proper element was removed from stack array, there is no
      // special handling.
      if (index === stack.length - 1) {
        await instance._close();
      }

      this.setState({
        stack: stack.slice(0, index).concat(stack.slice(index + 1)),
      });
    })();
  }

  closeAll = () => {
    Promise.all(this.state.stack.map(({ id }) => {
      const modal = this.modalInstances.get(id);
      return modal && modal._close();
    })).then(() => {
      this.setState({ stack: [] });
    }).catch(noop);
  }

  render() {
    return (
      <ModalStackContext.Provider value={this.state.stack}>
        <ModalNextIndexContext.Provider value={0}>
          <ModalStack />
        </ModalNextIndexContext.Provider>
      </ModalStackContext.Provider>
    );
  }
}

export default ModalProvider;
