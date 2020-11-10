import { createMixin } from "./base-mixin"

let computedObj = {}
export const mixin = createMixin({
  prototypeDidApply: (baseCtor, Super, instance): void => {
    Object.assign(computedObj, baseCtor.prototype.computed, instance.computed)
  },
  beforeFinishMixin: (baseCtors, Super): void => {
    if (Object.keys(computedObj).length) {
      Super.prototype.computed = computedObj
      computedObj = {}
    }
  },
})
