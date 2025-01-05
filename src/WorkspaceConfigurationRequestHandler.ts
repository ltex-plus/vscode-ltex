/* Copyright (C) 2019-2025
 * Julian Valentin, Daniel Spitzer, LTeX+ Development Community
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import * as Code from 'vscode';

import ExternalFileManager from './ExternalFileManager';

type ConfigurationItem = {
  scopeUri: string;
  section: string;
};

type LanguageSpecificSettingValue = {[language: string]: string[]};

type ConfigurationResultItem = {
  dictionary: LanguageSpecificSettingValue;
  disabledRules: LanguageSpecificSettingValue;
  enabledRules: LanguageSpecificSettingValue;
  hiddenFalsePositives: LanguageSpecificSettingValue;
};

export default class WorkspaceConfigurationRequestHandler {
  private _externalFileManager: ExternalFileManager;

  public constructor(externalFileManager: ExternalFileManager) {
    this._externalFileManager = externalFileManager;
  }

  private mergeSettings(uri: Code.Uri, settingName: string): LanguageSpecificSettingValue {
    const result: LanguageSpecificSettingValue = {};

    this._externalFileManager.updateWatchers(uri, settingName);

    const userSettingValue: LanguageSpecificSettingValue =
        this._externalFileManager.getSettingValue(uri, settingName,
          Code.ConfigurationTarget.Global);
    WorkspaceConfigurationRequestHandler.mergeLanguageSpecificSettingValue(
        result, userSettingValue);

    const workspaceSettingValue: LanguageSpecificSettingValue =
        this._externalFileManager.getSettingValue(uri, settingName,
          Code.ConfigurationTarget.Workspace);
    WorkspaceConfigurationRequestHandler.mergeLanguageSpecificSettingValue(
        result, workspaceSettingValue);

    const workspaceFolderSettingValue: LanguageSpecificSettingValue =
        this._externalFileManager.getSettingValue(uri, settingName,
          Code.ConfigurationTarget.WorkspaceFolder);
    WorkspaceConfigurationRequestHandler.mergeLanguageSpecificSettingValue(
        result, workspaceFolderSettingValue);

    for (const language in result) {
      if (!Object.prototype.hasOwnProperty.call(result, language)) continue;
      result[language] = WorkspaceConfigurationRequestHandler.cleanUpWorkspaceSpecificStringArray(
          result[language]);
    }

    return result;
  }

  private static mergeLanguageSpecificSettingValue(value1: LanguageSpecificSettingValue,
        value2: LanguageSpecificSettingValue | undefined): void {
    if (value2 == null) return;

    for (const language in value2) {
      if (!Object.prototype.hasOwnProperty.call(value2, language)) continue;
      if (!Object.prototype.hasOwnProperty.call(value1, language)) value1[language] = [];

      for (const entry of value2[language]) {
        value1[language].push(entry);
      }
    }
  }

  public static cleanUpWorkspaceSpecificStringArray(array: string[]): string[] {
    const negativeSet: Set<string> = new Set();
    const positiveSet: Set<string> = new Set();

    for (let entry of array) {
      if (entry.startsWith('-')) {
        entry = entry.substr(1);

        if (positiveSet.has(entry)) {
          positiveSet.delete(entry);
        } else {
          negativeSet.add(entry);
        }
      } else {
        positiveSet.add(entry);

        if (negativeSet.has(entry)) {
          negativeSet.delete(entry);
        } else {
          positiveSet.add(entry);
        }
      }
    }

    const result: string[] = [];
    for (const entry of negativeSet) result.push(`-${entry}`);
    for (const entry of positiveSet) result.push(entry);
    result.sort((a: string, b: string) => a.localeCompare(b, undefined, {sensitivity: 'base'}));

    return result;
  }

  public handle(params: {items: ConfigurationItem[]}): ConfigurationResultItem[] {
    const result: ConfigurationResultItem[] = [];

    for (const item of params.items) {
      const uri: Code.Uri = Code.Uri.parse(item.scopeUri);
      result.push({
        dictionary: this.mergeSettings(uri, 'dictionary'),
        disabledRules: this.mergeSettings(uri, 'disabledRules'),
        enabledRules: this.mergeSettings(uri, 'enabledRules'),
        hiddenFalsePositives: this.mergeSettings(uri, 'hiddenFalsePositives'),
      });
    }

    return result;
  }
}
