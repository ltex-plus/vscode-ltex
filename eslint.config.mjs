/* eslint-disable @typescript-eslint/typedef */
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import onlyWarn from 'eslint-plugin-only-warn';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default [...compat.extends(
    'eslint:recommended',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended',
), {
    plugins: {
        '@typescript-eslint': typescriptEslint,
        'only-warn': onlyWarn,
    },

    languageOptions: {
        globals: {
            ...globals.browser,
            ...globals.node,
            Atomics: 'readonly',
            SharedArrayBuffer: 'readonly',
        },

        parser: tsParser,
        ecmaVersion: 11,
        sourceType: 'module',

        parserOptions: {
            project: './tsconfig.json',
        },
    },

    rules: {
        '@typescript-eslint/explicit-module-boundary-types': ['off'],
        '@typescript-eslint/no-empty-function': ['off'],
        '@typescript-eslint/no-explicit-any': ['off'],
        '@typescript-eslint/no-inferrable-types': ['off'],
        '@typescript-eslint/no-non-null-assertion': ['off'],

        '@typescript-eslint/no-unused-vars': ['warn', {
            argsIgnorePattern: '^_',
            caughtErrorsIgnorePattern: '^_'
        }],

        '@typescript-eslint/typedef': ['warn', {
            arrayDestructuring: true,
            arrowParameter: true,
            memberVariableDeclaration: true,
            objectDestructuring: true,
            parameter: true,
            propertyDeclaration: true,
            variableDeclaration: true,
            variableDeclarationIgnoreFunction: true,
        }],

        indent: ['off'],
        'max-len': ['warn', 100],

        'no-constant-condition': ['warn', {
            checkLoops: false,
        }],

        'no-unused-vars': ['off'],

        'operator-linebreak': ['warn', 'before', {
            overrides: {
                '=': 'after',
                '+=': 'after',
                '-=': 'after',
            },
        }],

        'padded-blocks': ['off'],
        quotes: ['warn', 'single'],
        semi: ['warn', 'always'],
    },
}];