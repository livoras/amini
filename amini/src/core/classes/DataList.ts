import { Observable, forkJoin } from "rxjs"
import { catchError, finalize } from "rxjs/operators"

export interface IDataList<T> {
  dataList?: T[],
  lastFetchId?: number,
  isLoadingMore?: boolean,
  currentPage?: number,
}

type FetchDataListObservableFunction<Item> = (lastId: number, showLoading: boolean) => Observable<Item[]>

/**
 * 无限加载列表 使用Observable 实现 dataList，
 *
 * @export
 * @class DataList3
 * @template I
 */
// tslint:disable-next-line:max-classes-per-file
export class DataList3<I> {
  public dataList: I[] = []
  public prevDataList: I[] = []
  public currentPage: number = 1
  public lastFetchId: number = 1
  /** 是否继续加载 */
  public isLoadingMore: boolean = false
  /** 最后一页 */
  public isFinished: boolean = false
  /** 是否在加载中 */
  public isLoading: boolean = false

  /**
   * DataList3构造函数
   * @param {FetchDataListObservableFunction<I>} fetchDataList 获取数据的方法，返回一个Observable对象
   * @param {(list: I[], isLoadingMore: boolean, loadList: i[]) => void} listChanged 数据变动后的回调方法
   * @memberof DataList3
   *  @param pageSize 每页元素个数，默认为10，若不为默认值则一定要传进当前pageSize，否则使用重载方法会出错
   * WARNING: 注意 - 当需要使用map处理列表的时候，判断一下是否正确返回数据，返回为fail也会进入map，而且从map return出来的均为Observable.next
   */
  public constructor(
    private fetchDataList: FetchDataListObservableFunction<I>,
    public listChanged: (list: I[], isLoadingMore: boolean, loadList: I[]) => void,
    public pageSize: number = 10,
  ) { }

  public reloadDataList(isShowLoading: boolean = true): void {
    this.isFinished = false
    this.prevDataList = []
    const fetchDataListObservable = this.fetchDataList(1, isShowLoading)
    fetchDataListObservable.subscribe((list: I[]) => {
      this.dataList = list
      if (list.length < this.pageSize) {
        this.isFinished = true
      }
      this.currentPage = 1
      if (this.listChanged) {
        this.listChanged(this.dataList, false, list)
      }
    })
  }

  /** 加载更多 */
  public loadMoreDataList(isShowLoading: boolean = false): void {
    if (this.isFinished) { return }
    this.isLoadingMore = true
    this.isLoading = true
    this.fetchDataList(this.currentPage + 1, isShowLoading)
      .pipe(finalize(() => {
        this.isLoading = false
      }))
      .subscribe((moreDataList: I[]) => {
        const itemList = this.dataList
        this.prevDataList = itemList
        this.dataList = [...itemList, ...moreDataList]
        if (moreDataList.length < this.pageSize) {
          this.isFinished = true
        }
        this.currentPage = this.currentPage + 1
        this.isLoadingMore = false
        if (this.listChanged) {
          this.listChanged(this.dataList, true, moreDataList)
        }
      })
  }

  public setLastFetchId(): void {
    const lastIndex = this.dataList.length - 1
    const lastItem = this.dataList[lastIndex]
    if (lastItem) {
      this.lastFetchId = (lastItem as any).id
    } else {
      this.isFinished = true
    }
  }

  /** 重载当前末页 */
  public refreshLastestPage(isShowLoading: boolean = false): void {
    this.isLoadingMore = true
    this.isLoading = true
    this.fetchDataList(this.currentPage, isShowLoading)
      .pipe(finalize(() => {
        this.isLoading = false
      }))
      .subscribe((moreDataList: I[]) => {
        const itemList = this.prevDataList
        this.dataList = [...itemList, ...moreDataList]
        if (moreDataList.length < this.pageSize) {
          this.isFinished = true
        }
        this.isLoadingMore = false
        if (this.listChanged) {
          this.listChanged(this.dataList, false, moreDataList)
        }
      })
  }

  /** 重载当前页 */
  public refreshCurrentPage(index: number, isShowLoading: boolean = false): void {
    const pageIndex = Math.floor(index / this.pageSize) + 1
    if (pageIndex === this.currentPage) {
      this.refreshLastestPage()
      return
    }
    const saveItemNumber = this.pageSize * (pageIndex - 1)
    const saveList = this.dataList.filter((listItem, i) => i < saveItemNumber)
    this.currentPage = pageIndex
    const getCurrentPage = this.fetchDataList(this.currentPage, isShowLoading)
    const getNextPage = this.fetchDataList(this.currentPage + 1, isShowLoading)
    forkJoin([
      getCurrentPage,
      getNextPage,
    ])
      .subscribe((dataList: [I[], I[]]) => {
        const currentPageList = dataList[0]
        const nextPageList = dataList[1]
        this.dataList = [...saveList, ...currentPageList, ...nextPageList]
        if (nextPageList.length < this.pageSize) {
          this.isFinished = true
        }
        this.currentPage = this.currentPage + 1
        this.isLoadingMore = false
        if (this.listChanged) {
          this.listChanged(this.dataList, false, this.dataList)
        }
      })
  }
}
