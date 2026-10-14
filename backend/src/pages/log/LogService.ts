/** LogService.ts — หน้านี้อ่านอย่างเดียว ไม่มีกติกาธุรกิจ ส่งต่อไปที่ Repository ตรง ๆ */
import type { LogSearchDto } from './LogDto';
import type { LogRepository } from './LogRepository';

export class LogService {
  constructor(private repo: LogRepository) {}

  search({ q, page, action, pageNo, pageSize }: LogSearchDto) {
    return this.repo.search({ q, page, action }, { pageNo, pageSize });
  }
}
