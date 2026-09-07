/*
 * Copyright (c) 2026 Huawei Device Co., Ltd.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { webview } from '@kit.ArkWeb';
import { photoAccessHelper } from '@kit.MediaLibraryKit';

@Entry
@Component
struct Index {
  private controller: webview.WebviewController = new webview.WebviewController();

  private async selectRepairImages(event: OnShowFileSelectorEvent): Promise<void> {
    const options = new photoAccessHelper.PhotoSelectOptions();
    options.MIMEType = photoAccessHelper.PhotoViewMIMETypes.IMAGE_TYPE;
    options.maxSelectNumber = event.fileSelector.getMode() === FileSelectorMode.FileOpenMultipleMode ? 6 : 1;
    try {
      const picker = new photoAccessHelper.PhotoViewPicker();
      const selection = await picker.select(options);
      event.result.handleFileList(selection.photoUris);
    } catch {
      event.result.handleFileList([]);
    }
  }

  build() {
    Column() {
      Web({ src: 'http://127.0.0.1:8000', controller: this.controller })
        .javaScriptAccess(true)
        .domStorageAccess(true)
        .onShowFileSelector((event: OnShowFileSelectorEvent) => {
          this.selectRepairImages(event);
          return true;
        })
        .width('100%')
        .height('100%')
    }
    .height('100%')
    .width('100%')
  }
}
