/**
 * pages/request — คำขอเตียง (Round 1: มีเฉพาะ migration ของตาราง · API บอร์ดคิวจะเพิ่มใน Round 2)
 */
import { Router } from 'express';
import { definePage } from '../../core/pages';
import { requestMigrations } from './RequestMigration';

export const requestPage = definePage({
  name: 'request',
  minRole: 'STAFF',
  router: Router(),
  migrations: requestMigrations,
});
