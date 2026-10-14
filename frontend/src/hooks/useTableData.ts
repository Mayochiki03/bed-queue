/**
 * hooks/useTableData.ts — ตัวช่วยหน้ารายการ: โหลดข้อมูล + แบ่งหน้า + ตัวกรอง (แทนโค้ดที่ซ้ำกันทุกหน้า)
 *
 *   const t = useTableData(hospitalApi.search, { q: '', category: '' });
 *   t.rows            แถวของหน้านี้          t.paging         ข้อมูลแบ่งหน้า (ส่งให้ <Pagination>)
 *   t.draft           ค่าที่กำลังพิมพ์ในช่องกรอง   t.setDraft('q', 'abc')
 *   t.search()        ใช้ตัวกรองแล้วโหลดหน้า 1   t.reset()  ล้างตัวกรอง   t.reload()  โหลดหน้านี้ใหม่
 */
import { useCallback, useEffect, useState } from 'react';
import { usePopup } from '../components/Popup';
import type { ApiResult, PageResult } from '../api/client';

export type ListParams<F> = F & { pageNo: number; pageSize: number };

export function useTableData<T, F extends Record<string, string>>(fetcher: (params: ListParams<F>) => Promise<ApiResult<PageResult<T>>>, initialFilters: F) {
  const popup = usePopup();
  const [draft, setDraftState] = useState<F>(initialFilters);
  const [applied, setApplied] = useState<F>(initialFilters);
  const [pageNo, setPageNo] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [tick, setTick] = useState(0);
  const [data, setData] = useState<PageResult<T> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetcher({ ...applied, pageNo, pageSize }).then((res) => {
      if (cancelled) return;
      if (res.ok && res.data) setData(res.data);
      else popup.error(res.message);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied, pageNo, pageSize, tick]);

  const setDraft = useCallback((key: keyof F, value: string) => setDraftState((d) => ({ ...d, [key]: value })), []);
  const search = useCallback(() => {
    setPageNo(1);
    setApplied({ ...draft });
  }, [draft]);
  const reset = useCallback(() => {
    setDraftState(initialFilters);
    setApplied(initialFilters);
    setPageNo(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    rows: data?.resultList ?? [],
    paging: data ?? { pageNo: 1, pageSize, totalRow: 0, totalPage: 1, rowsPerPageOption: [15, 30, 50, 100] },
    loading,
    draft,
    setDraft,
    search,
    reset,
    reload: () => setTick((n) => n + 1),
    goPage: setPageNo,
    changePageSize: (n: number) => {
      setPageSize(n);
      setPageNo(1);
    },
  };
}
