import * as migration_20260824_201843_f0_init from './20260824_201843_f0_init';

export const migrations = [
  {
    up: migration_20260824_201843_f0_init.up,
    down: migration_20260824_201843_f0_init.down,
    name: '20260824_201843_f0_init'
  },
];
