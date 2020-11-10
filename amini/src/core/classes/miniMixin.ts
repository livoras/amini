import { SuperSetData } from "./SuperSetData"
import { mixin } from "@mono-shared/utils/mixin"

type Constructor<T> = new(...args: any[]) => T

export const miniMixin = <P, P1 = {}, P2 = {}, P3 = {}, P4 = {}, P5 = {}, P6 = {}, P7 = {}>(
  C1?: Constructor<P1>,
  C2?: Constructor<P2>,
  C3?: Constructor<P3>,
  C4?: Constructor<P4>,
  C5?: Constructor<P5>,
  C6?: Constructor<P6>,
  C7?: Constructor<P7>,
): {
  // tslint:disable-next-line:callable-types
  new(): SuperSetData<P, P & P1 & P2 & P3 & P4 & P5 & P6 & P7> & P1 & P2 & P3 & P4 & P5 & P6 & P7,
} => {
  return class extends mixin<any>(C1, C2, C3, C4, C5, C6, C7) {
    public data!: P
  } as any
}
