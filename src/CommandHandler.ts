/* Copyright (C) 2019-2021 Julian Valentin, LTeX Development Community
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import * as Code from 'vscode';
import * as CodeLanguageClient from 'vscode-languageclient/node';
import * as Path from 'path';

import BugReporter from './BugReporter';
import ExternalFileManager from './ExternalFileManager';
import * as Extension from './extension';
import {i18n} from './I18n';
import Logger from './Logger';
import ProgressStack from './ProgressStack';
import StatusPrinter from './StatusPrinter';
import WorkspaceConfigurationRequestHandler from './WorkspaceConfigurationRequestHandler';
import StatusBarItemManager from './StatusBarItemManager';

type LanguageSpecificSettingValue = {
  [language: string]: string[];
}

interface CheckDocumentCommandParams {
  uri: string;
  codeLanguageId?: string;
  text?: string;
  range?: Code.Range;
}

interface ServerCommandResult {
  success: boolean;
  errorMessage?: string;
}

export default class CommandHandler {
  private _context: Code.ExtensionContext;
  private _statusPrinter: StatusPrinter;
  private _bugReporter: BugReporter;
  private _languageClient: CodeLanguageClient.LanguageClient | null;
  private _externalFileManager: ExternalFileManager;
  private _statusBarItemManager: StatusBarItemManager | null;

  private static readonly _featureRequestUrl: string =
        'https://github.com/ltex-plus/vscode-ltex-plus/'
      + 'issues/new?assignees=&labels=1-feature-request%20%E2%9C%A8&'
      + 'template=feature-request.md&title=';

  private static readonly _defaultCodeLanguageIds: string[] = [
    'bibtex',
    'context',
    'context.tex',
    'html',
    'latex',
    'markdown',
    'mdx',
    'typst',
    'org',
    'quarto',
    'restructuredtext',
    'rsweave',
  ];

  public constructor(context: Code.ExtensionContext, externalFileManager: ExternalFileManager,
        statusInformationPrinter: StatusPrinter, bugReporter: BugReporter) {
    this._context = context;
    this._statusPrinter = statusInformationPrinter;
    this._bugReporter = bugReporter;
    this._languageClient = null;
    this._externalFileManager = externalFileManager;
    this._statusBarItemManager = null;

    context.subscriptions.push(Code.commands.registerCommand('ltex.activateExtension',
        this.activateExtension.bind(this)));
    context.subscriptions.push(Code.commands.registerCommand('ltex.checkSelection',
        this.checkSelection.bind(this)));
    context.subscriptions.push(Code.commands.registerCommand('ltex.checkCurrentDocument',
        this.checkCurrentDocument.bind(this)));
    context.subscriptions.push(Code.commands.registerCommand('ltex.checkAllDocumentsInWorkspace',
        this.checkAllDocumentsInWorkspace.bind(this)));
    context.subscriptions.push(Code.commands.registerCommand(
        'ltex.clearDiagnosticsInCurrentDocument',
        this.clearDiagnosticsInCurrentDocument.bind(this)));
    context.subscriptions.push(Code.commands.registerCommand('ltex.clearAllDiagnostics',
        this.clearAllDiagnostics.bind(this)));
    context.subscriptions.push(Code.commands.registerCommand('ltex.showStatusInformation',
        this.showStatusInformation.bind(this)));
    context.subscriptions.push(Code.commands.registerCommand('ltex.resetAndRestart',
        this.resetAndRestart.bind(this)));
    context.subscriptions.push(Code.commands.registerCommand('ltex.close',
      this.close.bind(this)));
    context.subscriptions.push(Code.commands.registerCommand('ltex.reportBug',
        this._bugReporter.report.bind(this._bugReporter)));
    context.subscriptions.push(Code.commands.registerCommand('ltex.requestFeature',
        this.requestFeature.bind(this)));

    context.subscriptions.push(Code.commands.registerCommand('_ltex.openMarkdownExample',
        this.openMarkdownExample.bind(this)));
    context.subscriptions.push(Code.commands.registerCommand('_ltex.openLatexExample',
        this.openLatexExample.bind(this)));

    context.subscriptions.push(Code.commands.registerCommand('_ltex.addToDictionary',
        this.addToDictionary.bind(this)));
    context.subscriptions.push(Code.commands.registerCommand('_ltex.disableRules',
        this.disableRules.bind(this)));
    context.subscriptions.push(Code.commands.registerCommand('_ltex.hideFalsePositives',
        this.hideFalsePositives.bind(this)));
  }

  public set languageClient(languageClient: CodeLanguageClient.LanguageClient | null) {
    this._languageClient = languageClient;
  }

  public set statusBarItemManager(statusBarItemManager: StatusBarItemManager | null) {
    this._statusBarItemManager = statusBarItemManager;
  }

  private activateExtension(): void {
    if(!Extension.isLtexenabledInConfig()){
      Extension.startLanguageClient();
    }
  }

  private async checkDocument(uri: Code.Uri, codeLanguageId?: string,
        text?: string, range?: Code.Range): Promise<boolean> {
    if (this._languageClient == null) {
      Code.window.showErrorMessage(i18n('ltexNotInitialized'));
      return Promise.resolve(false);
    }

    const params: CheckDocumentCommandParams = {
          uri: uri.toString(),
          codeLanguageId: codeLanguageId,
          text: text,
          range: range,
        };
    let result: ServerCommandResult = {
          success: false,
        };

    try {
      if (this._languageClient.needsStart()){
        this._statusBarItemManager?.setStatusToStarting();
      }
      await Promise.race([
        this._languageClient.needsStart() ? this._languageClient.start() : Promise.resolve(),
        new Promise((_resolve: (value: any) => void, reject: (e: Error) => void) => {
          setTimeout(() => reject(new Error(i18n('ltexNotInitialized'))), 30000);
        }),
      ]);
      result = await this._languageClient.sendRequest('workspace/executeCommand',
          {command: '_ltex.checkDocument', arguments: [params]});
    } catch (e: unknown) {
      result.success = false;

      try {
        result.errorMessage = (e as Error).message;
      } catch {
        // do nothing
      }
    }

    this._statusBarItemManager?.setStatusToReady();

    if (result.success) {
      return Promise.resolve(true);
    } else {
      Code.window.showErrorMessage(i18n('couldNotCheckDocument', uri.fsPath, result.errorMessage));
      return Promise.resolve(false);
    }
  }

  private async checkSelection(): Promise<boolean> {
    if (this._languageClient == null) {
      Code.window.showErrorMessage(i18n('ltexNotInitialized'));
      return Promise.resolve(false);
    }

    const textEditor: Code.TextEditor | undefined = Code.window.activeTextEditor;

    if (textEditor == null) {
      Code.window.showErrorMessage(i18n('noEditorOpenToCheckDocument'));
      return Promise.resolve(false);
    }

    return this.checkDocument(textEditor.document.uri, textEditor.document.languageId,
        textEditor.document.getText(), textEditor.selection);
  }

  private async checkCurrentDocument(): Promise<boolean> {
    if (this._languageClient == null) {
      Code.window.showErrorMessage(i18n('ltexNotInitialized'));
      return Promise.resolve(false);
    }

    const textEditor: Code.TextEditor | undefined = Code.window.activeTextEditor;

    if (textEditor == null) {
      Code.window.showErrorMessage(i18n('noEditorOpenToCheckDocument'));
      return Promise.resolve(false);
    }

    return this.checkDocument(textEditor.document.uri, textEditor.document.languageId,
        textEditor.document.getText());
  }

  private async checkAllDocumentsInWorkspace(): Promise<boolean> {
    if (this._languageClient == null) {
      Code.window.showErrorMessage(i18n('ltexNotInitialized'));
      return Promise.resolve(false);
    }

    const progressOptions: Code.ProgressOptions = {
          title: 'LTeX',
          location: Code.ProgressLocation.Notification,
          cancellable: true,
        };

    return Code.window.withProgress(progressOptions,
          async (progress: Code.Progress<{increment?: number; message?: string}>,
            token: Code.CancellationToken): Promise<boolean> => {
      const codeProgress: ProgressStack = new ProgressStack(
          i18n('checkingAllDocumentsInWorkspace'), progress);

      codeProgress.startTask(0.1, i18n('findingAllDocumentsInWorkspace'));
      if (token.isCancellationRequested) return Promise.resolve(true);

      const fileExtensions: string[] = CommandHandler.getEnabledFileExtensions();
      if (fileExtensions.length == 0) return Promise.resolve(true);
      const fileExtensionWildcard: string = fileExtensions.join(',');

      const uris: Code.Uri[] =
          await CommandHandler.findFiles(`**/*.{${fileExtensionWildcard}}`, token);
      uris.sort((lhs: Code.Uri, rhs: Code.Uri) => lhs.fsPath.localeCompare(rhs.fsPath));
      codeProgress.finishTask();

      codeProgress.startTask(0.9, i18n('checkingAllDocumentsInWorkspace'));
      const n: number = uris.length;

      for (let i: number = 0; i < n; i++) {
        codeProgress.updateTask(i / n,
            i18n('checkingDocumentN', i + 1, n, Path.basename(uris[i].fsPath)));
        if (token.isCancellationRequested) return Promise.resolve(true);
        const success: boolean = await this.checkDocument(uris[i]);
        if (!success) return Promise.resolve(false);
      }

      codeProgress.finishTask();

      if (n > 0) {
        return Promise.resolve(true);
      } else {
        Code.window.showErrorMessage((Code.workspace.workspaceFolders == null)
            ? i18n('couldNotCheckDocumentsAsNoFoldersWereOpened')
            : i18n('couldNotCheckDocumentsAsNoDocumentsWereFound'));
        return Promise.resolve(false);
      }
    });
  }

  private static async findFiles(
        globPattern: string, _token: Code.CancellationToken): Promise<Code.Uri[]> {
    return await Code.workspace.findFiles(globPattern, undefined, undefined, _token);
  }

  public static getDefaultCodeLanguageIds(): string[] {
    return CommandHandler._defaultCodeLanguageIds;
  }

  private static getEnabledFileExtensions(): string[] {
    const workspaceConfig: Code.WorkspaceConfiguration = Code.workspace.getConfiguration('ltex');
    const enabled: any = workspaceConfig.get('enabled');
    let enabledCodeLanguageIds: string[];

    if ((enabled === true) || (enabled === false)) {
      enabledCodeLanguageIds = (enabled ? CommandHandler._defaultCodeLanguageIds : []);
    } else {
      enabledCodeLanguageIds = enabled;
    }

    const enabledFileExtensions: Set<string> = new Set();

    for (const codeLanguageId of enabledCodeLanguageIds) {
      switch (codeLanguageId) {
        case 'bibtex': {
          enabledFileExtensions.add('bib');
          break;
        }
        case 'c': {
          enabledFileExtensions.add('c');
          enabledFileExtensions.add('h');
          break;
        }
        case 'clojure': {
          enabledFileExtensions.add('clj');
          break;
        }
        case 'coffeescript': {
          enabledFileExtensions.add('coffee');
          break;
        }
        case 'cpp': {
          enabledFileExtensions.add('cc');
          enabledFileExtensions.add('cpp');
          enabledFileExtensions.add('cxx');
          enabledFileExtensions.add('hh');
          enabledFileExtensions.add('hpp');
          enabledFileExtensions.add('inl');
          break;
        }
        case 'csharp': {
          enabledFileExtensions.add('cs');
          break;
        }
        case 'context': {
          enabledFileExtensions.add('tex');
          break;
        }
        case 'context.tex': {
          enabledFileExtensions.add('tex');
          break;
        }
        case 'dart': {
          enabledFileExtensions.add('dart');
          break;
        }
        case 'elixir': {
          enabledFileExtensions.add('ex');
          break;
        }
        case 'elm': {
          enabledFileExtensions.add('elm');
          break;
        }
        case 'erlang': {
          enabledFileExtensions.add('erl');
          break;
        }
        case 'fortran-modern': {
          enabledFileExtensions.add('f90');
          break;
        }
        case 'fsharp': {
          enabledFileExtensions.add('fs');
          break;
        }
        case 'go': {
          enabledFileExtensions.add('go');
          break;
        }
        case 'groovy': {
          enabledFileExtensions.add('groovy');
          break;
        }
        case 'haskell': {
          enabledFileExtensions.add('hs');
          break;
        }
        case 'html': {
          enabledFileExtensions.add('htm');
          enabledFileExtensions.add('html');
          enabledFileExtensions.add('xht');
          enabledFileExtensions.add('xhtml');
          break;
        }
        case 'java': {
          enabledFileExtensions.add('java');
          break;
        }
        case 'javascript': {
          enabledFileExtensions.add('js');
          break;
        }
        case 'julia': {
          enabledFileExtensions.add('jl');
          break;
        }
        case 'kotlin': {
          enabledFileExtensions.add('kt');
          break;
        }
        case 'latex': {
          enabledFileExtensions.add('tex');
          break;
        }
        case 'lisp': {
          enabledFileExtensions.add('lisp');
          break;
        }
        case 'lua': {
          enabledFileExtensions.add('lua');
          break;
        }
        case 'markdown': {
          enabledFileExtensions.add('md');
          break;
        }
        case 'matlab': {
          enabledFileExtensions.add('m');
          break;
        }
        case 'mdx': {
          enabledFileExtensions.add('mdx');
          break;
        }
        case 'org': {
          enabledFileExtensions.add('org');
          break;
        }
        case 'perl': {
          enabledFileExtensions.add('pl');
          break;
        }
        case 'php': {
          enabledFileExtensions.add('php');
          break;
        }
        case 'powershell': {
          enabledFileExtensions.add('ps1');
          break;
        }
        case 'puppet': {
          enabledFileExtensions.add('pp');
          break;
        }
        case 'python': {
          enabledFileExtensions.add('py');
          break;
        }
        case 'quatro': {
          enabledFileExtensions.add('qmd');
          break;
        }
        case 'r': {
          enabledFileExtensions.add('r');
          break;
        }
        case 'restructuredtext': {
          enabledFileExtensions.add('rst');
          break;
        }
        case 'rsweave': {
          enabledFileExtensions.add('Rnw');
          enabledFileExtensions.add('rnw');
          enabledFileExtensions.add('tex');
          break;
        }
        case 'ruby': {
          enabledFileExtensions.add('rb');
          break;
        }
        case 'rust': {
          enabledFileExtensions.add('rs');
          break;
        }
        case 'scala': {
          enabledFileExtensions.add('scala');
          break;
        }
        case 'shellscript': {
          enabledFileExtensions.add('sh');
          break;
        }
        case 'sql': {
          enabledFileExtensions.add('sql');
          break;
        }
        case 'swift': {
          enabledFileExtensions.add('swift');
          break;
        }
        case 'typescript': {
          enabledFileExtensions.add('ts');
          break;
        }
        case 'typst': {
          enabledFileExtensions.add('typ');
          break;
        }
        case 'vb': {
          enabledFileExtensions.add('vb');
          break;
        }
        case 'verilog': {
          enabledFileExtensions.add('v');
          break;
        }
      }
    }

    return Array.from(enabledFileExtensions).sort();
  }

  private async clearDiagnosticsInCurrentDocument(): Promise<boolean> {
    if (this._languageClient == null) {
      Code.window.showErrorMessage(i18n('ltexNotInitialized'));
      return Promise.resolve(false);
    }

    const diagnosticCollection: Code.DiagnosticCollection | undefined =
        this._languageClient.diagnostics;
    if (diagnosticCollection == null) return Promise.resolve(true);

    const textEditor: Code.TextEditor | undefined = Code.window.activeTextEditor;
    if (textEditor != null) diagnosticCollection.set(textEditor.document.uri, undefined);

    return Promise.resolve(true);
  }

  private clearAllDiagnostics(): boolean {
    if (this._languageClient == null) {
      Code.window.showErrorMessage(i18n('ltexNotInitialized'));
      return false;
    }

    const diagnosticCollection: Code.DiagnosticCollection | undefined =
        this._languageClient.diagnostics;
    if (diagnosticCollection != null) diagnosticCollection.clear();

    return true;
  }

  private async showStatusInformation(): Promise<void> {
    await this._statusPrinter.print();
    Logger.showClientOutputChannel();
    return Promise.resolve();
  }

  private async resetAndRestart(): Promise<void> {
    for (const disposable of this._context.subscriptions) {
      disposable.dispose();
    }

    await Extension.activate(this._context);
    return Promise.resolve();
  }

  private async close(){
    Extension.deactivate();
  }

  private async requestFeature(): Promise<void> {
    await Code.window.showInformationMessage(i18n('thanksForRequestingFeature'),
          i18n('createIssue')).then(async (selectedItem: string | undefined) => {
      if (selectedItem == i18n('createIssue')) {
        Code.env.openExternal(Code.Uri.parse(CommandHandler._featureRequestUrl));
      }
    });

    return Promise.resolve();
  }

  private async openMarkdownExample(): Promise<void> {
    await Code.workspace.openTextDocument({language: 'markdown',
        content: `# Markdown Example

This is a sentence *without any errors.*
This is a sentence *with a speling error in it.*
Finally, this is a sentence *with an grammar error in it.*
`});
    return Promise.resolve();
  }

  private async openLatexExample(): Promise<void> {
    await Code.workspace.openTextDocument({language: 'latex',
        content: `\\section{\\LaTeX{} Example}

This is a sentence \\emph{without any errors.}
This is a sentence \\emph{with a speling error.}
Finally, this is a sentence \\emph{with an grammar error.}
`});
    return Promise.resolve();
  }

  private addToDictionary(params: any): void {
    this.addToLanguageSpecificSetting(Code.Uri.parse(params.uri), 'dictionary', params.words);
    this.checkCurrentDocument();
  }

  private disableRules(params: any): void {
    this.addToLanguageSpecificSetting(Code.Uri.parse(params.uri), 'disabledRules', params.ruleIds);
    this.checkCurrentDocument();
  }

  private hideFalsePositives(params: any): void {
    this.addToLanguageSpecificSetting(Code.Uri.parse(params.uri), 'hiddenFalsePositives',
        params.falsePositives);
    this.checkCurrentDocument();
  }

  private addToLanguageSpecificSetting(uri: Code.Uri, settingName: string,
        entries: LanguageSpecificSettingValue): void {
    const resourceConfig: Code.WorkspaceConfiguration =
        Code.workspace.getConfiguration('ltex.configurationTarget', uri);
    const scopeString: string | undefined = resourceConfig.get(settingName);
    let scopes: Code.ConfigurationTarget[];

    if ((scopeString == null) || scopeString.startsWith('workspaceFolder')) {
      scopes = [Code.ConfigurationTarget.WorkspaceFolder, Code.ConfigurationTarget.Workspace,
          Code.ConfigurationTarget.Global];
    } else if (scopeString.startsWith('workspace')) {
      scopes = [Code.ConfigurationTarget.Workspace, Code.ConfigurationTarget.Global];
    } else if (scopeString.startsWith('user')) {
      scopes = [Code.ConfigurationTarget.Global];
    } else {
      Logger.error(i18n('invalidValueForConfigurationTarget', scopeString));
      return;
    }

    if ((scopeString == null) || scopeString.endsWith('ExternalFile')) {
      this.addToLanguageSpecificSettingExternalFile(uri, settingName, scopes, entries);
    } else {
      this.addToLanguageSpecificSettingInternalSetting(uri, settingName, scopes, entries);
    }
  }

  private addToLanguageSpecificSettingExternalFile(uri: Code.Uri, settingName: string,
        scopes: Code.ConfigurationTarget[], entries: LanguageSpecificSettingValue): void {
    for (const language in entries) {
      if (!Object.prototype.hasOwnProperty.call(entries, language)) continue;
      let settingWritten: boolean = false;

      for (const scope of scopes) {
        const externalFilePath: string | null = this._externalFileManager.getFirstExternalFilePath(
            uri, settingName, scope, language);

        if (externalFilePath != null) {
          this._externalFileManager.appendToFile(externalFilePath, settingName, entries[language]);
          settingWritten = true;
          break;
        }
      }

      if (!settingWritten) {
        const languageEntries: LanguageSpecificSettingValue = {};
        languageEntries[language] = entries[language];
        this.addToLanguageSpecificSettingInternalSetting(uri, settingName, scopes, languageEntries);
      }
    }
  }

  private async addToLanguageSpecificSettingInternalSetting(uri: Code.Uri, settingName: string,
        scopes: Code.ConfigurationTarget[], entries: LanguageSpecificSettingValue): Promise<void> {
    const resourceConfig: Code.WorkspaceConfiguration =
        Code.workspace.getConfiguration('ltex', uri);
    const settingValue: {[language: string]: string[]} = resourceConfig.get(settingName, {});

    for (const language in entries) {
      if (!Object.prototype.hasOwnProperty.call(entries, language)) continue;
      let languageSettingValue: string[] = ((settingValue[language] != null)
          ? settingValue[language] : []);
      languageSettingValue = languageSettingValue.concat(entries[language]);
      settingValue[language] = WorkspaceConfigurationRequestHandler.
          cleanUpWorkspaceSpecificStringArray(languageSettingValue);
    }

    for (let i: number = 0; i < scopes.length; i++) {
      try {
        await resourceConfig.update(settingName, settingValue, scopes[i]);
        return;
      } catch (e: unknown) {
        if (i == scopes.length - 1) Logger.error(i18n('couldNotSetConfiguration', settingName), e);
      }
    }
  }
}
