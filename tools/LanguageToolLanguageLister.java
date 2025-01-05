/* Copyright (C) 2019-2025
 * Julian Valentin, Daniel Spitzer, LTeX+ Development Community
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import org.languagetool.Language;
import org.languagetool.Languages;

public class LanguageToolLanguageLister {
  public static void main(String[] args) {
    for (Language language : Languages.get()) {
      System.out.println(language.getShortCodeWithCountryAndVariant() + ";" + language.getName());
    }
  }
}
