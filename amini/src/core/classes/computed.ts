import { NOOP } from "@mono-shared/models/interfaces"
import { SuperSetData } from "./SuperSetData"
// tslint:disable: max-classes-per-file
function noop(): void {}

type DepId = string | number | symbol

type Key = DepId

const sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: noop,
  set: noop,
}

const targetStack: any[] = []
function pushTarget(newTarget: any): void {
  if (Dep.target) { targetStack.push(Dep.target) }
  Dep.target = newTarget
}

function popTarget(): void {
  Dep.target = targetStack.pop()
}

function createComputedGetter(key: any): any {
  return function(this: any): any {
    const watcher = this.computedWatchers && this.computedWatchers[key]
    // watcher.evaluate()
    if (Dep.target) {
      watcher.depend()
    }
    return watcher.value
    // return this.data[key]
  }
}

function defineReactive(value: any, key: Key, val: any, targetPage?: any): void {
  const dep = new Dep(key)
  targetPage.computedDepsMap.set(dep.id, dep)
  Object.defineProperty(value, key, {
    configurable: true,
    enumerable: true,
    get(): any {
      if (Dep.target) {
        dep.depend()
      }
      return targetPage.data[key]
    },
    set: noop,
  })
}

function getKey(key: string): string {
  const token = [".", "["]
  for (let i = 0; i < key.length; i++) {
    if (token.includes(key[i])) {
      key = key.substring(0, i)
      break
    }
  }
  return key
}

class Watcher {
  public page: any
  public id: string
  public computedInstance: Computed<{}>
  public getter: any
  public cb: any
  public value: any
  public deps: Dep[] = []
  public depIds = new Set()
  constructor(
    page: any,
    fn: any,
    cb: any,
    options: any,
    computedInstance: Computed<{}>,
    key: any,
  ) {
    this.page = page
    this.computedInstance = computedInstance
    this.getter = fn
    this.cb = cb
    this.id = key
  }

  public depend(): void {
    let i = this.deps.length
    while (i--) {
      this.deps[i].depend()
    }
  }

  public addDep(dep: Dep): void {
    // log(dep)
    const id = dep.id
    if (!this.depIds.has(id)) {
      this.depIds.add(id)
      this.deps.push(dep)
      dep.addSub(this)
    }
  }

  public get(): any {
    pushTarget(this)
    let value
    try {
      value = this.getter.call(this.page, this.computedInstance.data)
    } catch (e) {
      console.error(e)
    } finally {
      // "touch" every property so they are all tracked as
      // dependencies for deep watching
      popTarget()
    }
    return value
  }

  public evaluate(): void {
    this.value = this.get()
  }

  public update(): void {
    this.evaluate()
    const key = this.id
    if (
      !this.computedInstance.updatePool.includes(key)
      && this.value !== this.page.data[key]
    ) {
      this.computedInstance.updatePool.push(key)
    }
  }

  public teardown(): void {
    let i = this.deps.length
    while (i--) {
      this.deps[i].removeSub(this)
    }
  }
}

class Dep {
  public static target: Watcher
  public subs: Watcher[]
  public id: DepId
  constructor(key: DepId) {
    this.id = key
    this.subs = []
  }

  public depend(): void {
    if (Dep.target) {
      Dep.target.addDep(this)
    }
  }

  public addSub(sub: Watcher): void {
    this.subs.push(sub)
  }

  public removeSub(sub: Watcher): void {
    if (this.subs.length) {
      const index = this.subs.indexOf(sub)
      if (index > -1) { this.subs.splice(index, 1) }
    }
  }

  public notify(): void {
    const subs = this.subs.slice()
    for (let i = 0, l = subs.length; i < l ; i++) {
      subs[i].update()
    }
  }
}

export class Computed<T> {
  public data = {} as T
  public page: SuperSetData<{}>
  public originSetData: any
  public updatePool: Key[] = []
  constructor(
    page: any,
  ) {
    this.page = page
    this.initData()
    this.proxySetData()
    this.updateComputedData()
    console.log("----- init computed -----")
  }

  public initData(): void {
    const { data: originData } = this.page
    this.page.computedDepsMap = new Map()
    Object.keys(originData).forEach((key) => {
      defineReactive(this.data, key, originData[key], this.page)
    })
    this.initComputed()
  }

  public initComputed(): void {
    const watchers = this.page.computedWatchers = Object.create(null)
    const computedDef = this.page.computed || {}
    // tslint:disable-next-line: forin
    for (const key in computedDef) {
      const userDef = computedDef[key]
      watchers[key] = new Watcher(this.page, userDef, noop, {}, this, key)
      if (!(key in this.data)) {
        Object.defineProperty(this.data, key,
          { ...sharedPropertyDefinition, get: createComputedGetter(key).bind(this.page) },
        )
      }
      watchers[key].update()
    }
  }

  public proxySetData(): void {
    this.originSetData = this.page.setData
    Object.defineProperty(this.page, "setData", {
      configurable: false,
      enumerable: false,
      writable: true,
      value: (obj: any, cb?: NOOP): any => {
        let computedShouldUpdate = false
        const setDataReturn = cb ? this.originSetData.call(this.page, obj, cb) : this.originSetData.call(this.page, obj)
        Object.keys(obj).forEach((key) => {
          key = getKey(key)
          if (this.page.computedDepsMap.has(key)) {
            const dep = this.page.computedDepsMap.get(key) as Dep
            dep.notify()
          } else {
            computedShouldUpdate = true
            // console.log("--->key", key)
            defineReactive(this.data, key, obj[key], this.page)
          }
        })
        if (computedShouldUpdate) {
          this.triggerAllWatchersUpdate()
        }
        this.updateComputedData()
        return setDataReturn
      },
    })
  }

  public updateComputedData(): void {
    if (this.updatePool.length > 0) {
      const computedData = {}
      this.updatePool.forEach((key) => {
        Object.assign(computedData, { [key]: this.page.computedWatchers[key].value })
      })
      this.updatePool.length = 0
      this.originSetData.call(this.page, computedData)
    }
  }

  private triggerAllWatchersUpdate(): void {
    const watchers = this.page.computedWatchers
    Object.keys(watchers).forEach((watcherKey) => {
      const wtacherIns = watchers[watcherKey] as Watcher
      wtacherIns.update()
    })
  }

}
