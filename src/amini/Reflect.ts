const metaMap = new Map()

// tslint:disable-next-line: no-namespace
declare namespace Reflect {
  function metadata(...args: any[]): any
  function getMetadata(...args: any[]): any
}

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

// tslint:disable-next-line: only-arrow-functions
Reflect.metadata = function(metaKey: any, metaValue: any): any {
  // tslint:disable-next-line: only-arrow-functions
  return function(target: any, propKey: any): void {
    const metas = metaMap.get(target) || new Map()
    metas.set(metaKey, metaValue)
    metaMap.set(target, metas)
  }
}

// tslint:disable-next-line: only-arrow-functions
Reflect.getMetadata = function(metaName: any, target: any): any {
  const metas = metaMap.get(target)
  if (!metas) { return }
  return metas.get(metaName)
}
