#!/usr/bin/python3

# Copyright (C) 2019-2025
# Julian Valentin, Daniel Spitzer, LTeX+ Development Community
#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

import json
import os
import pathlib
import re
import subprocess
import sys
import traceback
from typing import Any, Optional, Tuple
import urllib.parse
import urllib.request



repoDirPath = pathlib.Path(__file__).parent.parent



def getToBeDownloadedVersions() -> Tuple[str, str]:
  with open(repoDirPath.joinpath("src", "DependencyManager.ts"), "r") as f:
    dependencyManagerTypescript = f.read()

  matches = re.findall(r"_toBeDownloadedLtexLsTag: string =\n *'(.*?)';",
      dependencyManagerTypescript)
  assert len(matches) == 1
  toBeDownloadedLtexLsTag = matches[0]

  matches = re.findall(r"_toBeDownloadedLtexLsVersion: string =\n *'(.*?)';",
      dependencyManagerTypescript)
  assert len(matches) == 1
  toBeDownloadedLtexLsVersion = matches[0]

  return toBeDownloadedLtexLsTag, toBeDownloadedLtexLsVersion

toBeDownloadedLtexLsTag, toBeDownloadedLtexLsVersion = getToBeDownloadedVersions()



def getGitHubOrganizationRepository() -> Tuple[str, str]:
  output = subprocess.run(["git", "remote", "get-url", "origin"],
      cwd=pathlib.Path(__file__).parent.parent, stdout=subprocess.PIPE).stdout.decode()
  regexMatch = re.search(r"github.com[:/](.*?)/(.*?)(?:\.git)?$", output)
  assert regexMatch is not None, output
  organization, repository = regexMatch.group(1), regexMatch.group(2)
  return organization, repository

organization, repository = getGitHubOrganizationRepository()



def requestFromGitHub(url: str, decodeAsJson: bool = True,
      method: Optional[str] = None, data: Optional[str] = None) -> Any:
  headers = {}

  if "LTEX_GITHUB_OAUTH_TOKEN" in os.environ:
    headers["Authorization"] = "token {}".format(os.environ["LTEX_GITHUB_OAUTH_TOKEN"])

  apiRequest = urllib.request.Request(url, headers=headers,
      data=(None if data is None else data.encode()), method=method)

  try:
    with urllib.request.urlopen(apiRequest) as f: response = f.read()
  except urllib.error.HTTPError as e:
    traceback.print_exc()
    print("Response body: \"{!r}\"".format(e.read()))
    sys.exit(1)

  if decodeAsJson: response = json.loads(response)
  return response
