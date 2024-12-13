/* Copyright (C) 2019-2021 Julian Valentin, LTeX Development Community
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

// #if TARGET == 'vscode'
import * as Code from 'vscode';
import * as CodeLanguageClient from 'vscode-languageclient/node';
// #elseif TARGET == 'coc.nvim'
// import * as Code from 'coc.nvim';
// import CodeLanguageClient = Code;
// #endif

import {i18n} from './I18n';
import Logger from './Logger';

enum Status {
  starting,
  ready,
  checking,
  disabled
}

interface ProgressParams<T> {
  token: CodeLanguageClient.ProgressToken;
  value: T;
}

export default class StatusBarItemManager {
  private _statusBarItem: Code.StatusBarItem;
  private _progressMap: {
        [token: string]: {
          progress: number;
          startTime: number;
        };
      };
  private _status: Status;

  private _startingStatusText: string;
  private _readyStatusText: string;
  private _checkingStatusText: string;
  private _disabledStatusText: string;

  private static readonly readyStatusDuration: number = 1000;
  private static readonly checkingStatusDelay: number = 5000;
  private static readonly disabledStatusDuration: number = 5000;

  public constructor(context: Code.ExtensionContext) {
    // #if TARGET == 'vscode'
    this._statusBarItem = Code.window.createStatusBarItem(Code.StatusBarAlignment.Left);
    // #elseif TARGET == 'coc.nvim'
    // this._statusBarItem = Code.window.createStatusBarItem();
    // #endif
    this._progressMap = {};
    this._status = Status.starting;

    // #if TARGET == 'vscode'
    this._startingStatusText = `$(loading~spin) ${i18n('startingLtex')}`;
    this._readyStatusText = `$(check) ${i18n('ltexReady')}`;
    this._checkingStatusText = `$(loading~spin) ${i18n('ltexIsChecking')}`;
    this._disabledStatusText = `$(error) ${i18n('disableLtex')}`;
    // #elseif TARGET == 'coc.nvim'
    // this._startingStatusText = i18n('startingLtex');
    // this._readyStatusText = i18n('ltexReady');
    // this._checkingStatusText = i18n('ltexIsChecking');
    // #endif

    context.subscriptions.push(this._statusBarItem);
    context.subscriptions.push(Code.workspace.onDidChangeConfiguration(
        this.onDidChangeConfiguration, this));

    this.setStatusToStarting();
  }

  private onDidChangeConfiguration(event: Code.ConfigurationChangeEvent): void {
    if (event.affectsConfiguration('ltex.statusBarItem')) this.update();
  }

  private update(): void {
    if (this._status == Status.starting) {
      this._statusBarItem.text = this._startingStatusText;
      // #if TARGET == 'coc.nvim'
      // this._statusBarItem.isProgress = true;
      // #endif
      this._statusBarItem.show();
      return;
    }

    const tokens: string[] = StatusBarItemManager.getKeys(this._progressMap);
    const now: number = Date.now();

    for (const token of tokens) {
      if (now - this._progressMap[token].startTime >= StatusBarItemManager.checkingStatusDelay) {
        this._status = Status.checking;
        this._statusBarItem.text = this._checkingStatusText;
        // #if TARGET == 'coc.nvim'
        // this._statusBarItem.isProgress = true;
        // #endif
        this._statusBarItem.show();
        return;
      }
    }

    const oldStatus: Status = this._status;
    this._status = Status.ready;
    this._statusBarItem.text = this._readyStatusText;

    if (oldStatus == Status.checking) {
      this.setStatusToReady();
      return;
    }

    const visible: boolean | undefined =
        Code.workspace.getConfiguration('ltex').get('statusBarItem');

    if ((visible != null) && visible) {
      this._statusBarItem.show();
    } else {
      this._statusBarItem.hide();
    }
  }

  private static getKeys(obj: any): string[] {
    const result: string[] = [];

    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) result.push(key);
    }

    return result;
  }

  public setStatusToStarting(): void {
    this._status = Status.starting;
    this.update();
  }

  public setStatusToReady(): void {
    this._status = Status.ready;
    this._statusBarItem.text = this._readyStatusText;
    // #if TARGET == 'coc.nvim'
    // this._statusBarItem.isProgress = true;
    // #endif
    this._statusBarItem.show();
    setTimeout(this.update.bind(this), StatusBarItemManager.readyStatusDuration);
  }

  public handleProgressNotification(
        params: ProgressParams<CodeLanguageClient.WorkDoneProgressBegin |
          CodeLanguageClient.WorkDoneProgressReport |
          CodeLanguageClient.WorkDoneProgressEnd>): void {
    let token: {
      uri: string,
      operation: string,
      uuid: string,
    };

    try {
      token = JSON.parse(params.token.toString());
    } catch (_e: unknown) {
      Logger.warn(i18n('couldNotParseTokenInProgressNotification', params.token, params));
      return;
    }

    if (token.operation != 'checkDocument') {
      Logger.warn(i18n('unknownOperationInProgressNotification', token.operation, params));
      return;
    }

    if (params.value.kind == 'begin') {
      this._progressMap[params.token] = {progress: 0, startTime: Date.now()};
      setTimeout(this.update.bind(this), StatusBarItemManager.checkingStatusDelay + 100);
    } else if (params.value.kind == 'end') {
      if (Object.prototype.hasOwnProperty.call(this._progressMap, params.token)) {
        delete this._progressMap[params.token];
        this.update();
      }
    }
  }

  public setStatusToDisabled(){
    this._status = Status.disabled;
    this._statusBarItem.text = this._disabledStatusText;
    this._statusBarItem.show();
    setTimeout(() =>{this._statusBarItem.hide();}, StatusBarItemManager.disabledStatusDuration);
  }
}
