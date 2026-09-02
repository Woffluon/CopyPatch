import { describe, expect, it } from 'vitest';
import * as publicApi from '../src/index.js';
import type { CopyPatchStoreApi, CopyPatchStoreState } from '../src/index.js';

type Equal<Left, Right> = (
  <Value>() => Value extends Left ? 1 : 2
) extends (
  <Value>() => Value extends Right ? 1 : 2
)
  ? true
  : false;
type Assert<Value extends true> = Value;

type PublicStateIsDeepReadonly = Assert<Equal<
  CopyPatchStoreState['published'],
  Readonly<Record<string, string>>
>>;
type PublicStoreReturnsPublicState = Assert<Equal<
  ReturnType<CopyPatchStoreApi['getState']>,
  CopyPatchStoreState
>>;

describe('React root public API', () => {
  it('exports only the documented public allowlist', () => {
    expect(publicApi.CopyPatchProvider).toBeTypeOf('function');
    expect(publicApi.EditableText).toBeTypeOf('function');
    expect(publicApi.useCopyPatch).toBeTypeOf('function');
    expect(publicApi.useEditableText).toBeTypeOf('function');
    expect(publicApi.useCopyPatchStore).toBeTypeOf('function');
    expect('CopyPatchStore' in publicApi).toBe(false);
    expect('CopyPatchContext' in publicApi).toBe(false);
    expect('Listener' in publicApi).toBe(false);
  });
});
