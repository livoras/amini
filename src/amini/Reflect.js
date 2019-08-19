/*! *****************************************************************************
Copyright (C) Microsoft. All rights reserved.
Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0

THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
MERCHANTABLITY OR NON-INFRINGEMENT.

See the Apache Version 2.0 License for specific language governing permissions
and limitations under the License.
***************************************************************************** */
(function (Reflect) {
  const metaMap = new Map()

  // Reflect.decorate = function(decorators, target, propKey, attrs) {
  //   let decorated = target
  //   for (const decorator of decorators.reverse()) {
  //     if (!attrs) {
  //       decorator(decorated, target, propKey, attrs)
  //     } else {
  //       decorator(decorated, propKey, attrs)
  //     }
  //   }
  //   return decorated
  // }

  Reflect.metadata = function(metaKey, metaValue) {
    return function(target, propKey) {
      const metas = metaMap.get(target) || new Map()
      metas.set(metaKey, metaValue)
      metaMap.set(target, metas)
    }
  }

  Reflect.getMetadata = function(metaName, target) {
    const metas = metaMap.get(target)
    if (!metas) { return }
    return metas.get(metaName)
  }
})(Reflect || (Reflect = {}));
//# sourceMappingURL=Reflect.js.map
