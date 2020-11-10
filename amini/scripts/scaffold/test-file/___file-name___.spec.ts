// const app = {globalData: {} as any};
// 规避 getApp 编译不过的问题，也可以改写为其他全局属性
// (global as any).getApp = () => app

import anyTest, {TestInterface} from "ava"

/** TestInterface<> 泛型写需要的上下文类型 */
const test = anyTest as TestInterface<any>

test('method 1 should pass', (t) => {
  t.pass()
})

test('method 2: pass once', (t) => {
  t.pass()
})

test('method 2: pass twice', (t) => {
  t.pass()
})
