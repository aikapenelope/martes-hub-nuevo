import * as migration_20260824_201843_f0_init from './20260824_201843_f0_init';
import * as migration_20260825_021413_f1_core_collections from './20260825_021413_f1_core_collections';
import * as migration_20260825_023329_f1b_multi_tenant from './20260825_023329_f1b_multi_tenant';

export const migrations = [
  {
    up: migration_20260824_201843_f0_init.up,
    down: migration_20260824_201843_f0_init.down,
    name: '20260824_201843_f0_init',
  },
  {
    up: migration_20260825_021413_f1_core_collections.up,
    down: migration_20260825_021413_f1_core_collections.down,
    name: '20260825_021413_f1_core_collections',
  },
  {
    up: migration_20260825_023329_f1b_multi_tenant.up,
    down: migration_20260825_023329_f1b_multi_tenant.down,
    name: '20260825_023329_f1b_multi_tenant'
  },
];
