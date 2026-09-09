import { describe, expect, it, vi } from 'vitest'

/**
 * Issue #110 — causa raíz y fix por construcción:
 * checkFileRestrictions de Payload 3.88 corre fileTypeFromBuffer SOLO cuando
 * la colección tiene upload.mimeTypes (allowlist). El buffer que
 * payload-invoicepdf pasa por Local API rompe esa detección (payload#13309).
 * La colección invoice-media NO define mimeTypes → el chequeo de blocklist
 * usa filename+mimetype declarado y el pipeline vuelve a funcionar.
 *
 * Este spec documenta y blinda esa semántica contra regresiones (p. ej., que
 * nadie le "añada" una allowlist a invoice-media sin entender el #110).
 */

// Import directo del código real de Payload (no mock): la semántica del
// chequeo es el objeto del test. El package.json de payload restringe los
// subpaths por "exports", así que se resuelve la ruta real del entry y se
// requiere el archivo por path absoluto.
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { InvoiceMedia } from '@/collections/InvoiceMedia'
import { Media } from '@/collections/Media'

const nodeRequire = createRequire(import.meta.url)
const payloadEntry = nodeRequire.resolve('payload')
const { checkFileRestrictions } = nodeRequire(
  join(dirname(payloadEntry), 'uploads', 'checkFileRestrictions.js'),
) as {
  checkFileRestrictions: (args: { collection: unknown; file: unknown; req: unknown }) => Promise<void>
}

function fakeReq() {
  return {
    payload: {
      logger: { error: vi.fn() },
    },
  } as never
}

// Buffer problemático del issue #110: lo que renderPdfToBuffer entrega al
// Local API en el runner — para el tokenizer de file-type no es tipable
// (bytes sin firma detectable). Cero bytes reproduce la clase de buffer que
// hace fallar la detección; el mensaje exacto de falla depende del entorno
// del renderer, pero la semántica del fix es independiente de eso.
const undetectableBuffer = new Uint8Array(0)

function uploadFileLike(buffer: Uint8Array, name = 'invoice-INV-001.pdf', mimetype = 'application/pdf') {
  return {
    name,
    mimetype,
    data: buffer,
    size: buffer.length,
  } as never
}

describe('invoice-media — resolución del issue #110', () => {
  it('la colección invoice-media NO define allowlist de mimeTypes (condición del fix)', () => {
    const uploadConfig = InvoiceMedia.upload as Record<string, unknown> | undefined
    expect(uploadConfig).toBeDefined()
    expect(Array.isArray(uploadConfig?.mimeTypes) ? uploadConfig.mimeTypes.length : 0).toBe(0)
  })

  it('checkFileRestrictions con config SIN allowlist acepta el buffer del plugin (no lanza)', async () => {
    const collection = {
      config: InvoiceMedia,
      upload: InvoiceMedia.upload,
    } as never

    await expect(
      checkFileRestrictions({
        collection,
        file: uploadFileLike(undetectableBuffer),
        req: fakeReq(),
      }),
    ).resolves.toBeUndefined()
  })

  it('checkFileRestrictions con allowlist (media) rechaza lo que el fallback no tipa — documenta la causa raíz', async () => {
    const collection = {
      config: Media,
      upload: Media.upload,
    } as never

    // Un mimetype no incluido en la allowlist de media (p. ej. el stream del
    // renderer del plugin) es rechazado ahí y aceptado por invoice-media
    // (test anterior): esa diferencia estructural ES el fix del #110.
    await expect(
      checkFileRestrictions({
        collection,
        file: uploadFileLike(
          new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), // '%PDF-'
          'invoice-INV-001.pdf',
          'application/octet-stream',
        ),
        req: fakeReq(),
      }),
    ).rejects.toThrow()
  })

  it('la blocklist dura sigue activa en invoice-media: un .exe se rechaza igual', async () => {
    const collection = {
      config: InvoiceMedia,
      upload: InvoiceMedia.upload,
    } as never

    const exeBytes = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]) // firma MZ
    await expect(
      checkFileRestrictions({
        collection,
        file: uploadFileLike(exeBytes, 'virus.exe', 'application/x-msdownload'),
        req: fakeReq(),
      }),
    ).rejects.toThrow()
  })
})

// ============================================================================
// Hallazgos Devin PR #113 — endurecimiento de invoice-media
// ============================================================================

type BeforeValidateHook = (args: { data: unknown; req: unknown }) => Promise<unknown>

const hook = InvoiceMedia.hooks?.beforeValidate?.[0] as BeforeValidateHook

function uploadReq(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    file: { name: 'COT-2026-0001.pdf', mimetype: 'application/pdf', data: new Uint8Array(10), size: 10 },
    context: {},
    headers: {},
    user: null,
    payload: { logger: { error: vi.fn() } },
    ...overrides,
  }
}

describe('invoice-media — hallazgos Devin PR #113', () => {
  // Payload envuelve el detalle en ValidationError.data.errors — el match
  // confiable es sobre el mensaje del primer error.
  async function hookError(args: { data: unknown; req: unknown }): Promise<string> {
    try {
      await hook(args)
      return '(no lanzó)'
    } catch (err) {
      const data = (err as { data?: { errors?: { message?: string }[] } }).data
      return data?.errors?.[0]?.message ?? (err as Error).message
    }
  }

  it('🟥 #113-4: rechaza subidas no-PDF (filename o mimetype) — la colección no es hosting arbitrario', async () => {
    expect(
      await hookError({
        data: { alt: 'x' },
        req: uploadReq({ file: { name: 'foto.jpg', mimetype: 'image/jpeg', data: new Uint8Array(4), size: 4 } }),
      }),
    ).toMatch(/solo acepta PDFs/)
    expect(
      await hookError({
        data: { alt: 'x' },
        req: uploadReq({ file: { name: 'doc.pdf', mimetype: 'text/html', data: new Uint8Array(4), size: 4 } }),
      }),
    ).toMatch(/solo acepta PDFs/)
  })

  it('acepta el flujo del plugin: *.pdf + application/pdf (req con usuario del contexto)', async () => {
    // Flujo real: las acciones del repo operan con usuario autenticado y
    // context.tenantId — el hook resuelve y deja pasar el PDF.
    const res = await hook({
      data: { alt: 'x' },
      req: uploadReq({ context: { tenantId: 3 }, user: { tenants: [{ tenant: 3 }] } }),
    })
    expect(res).toMatchObject({ alt: 'x', tenant: 3 })
  })

  it('🟨 #113-1: context.tenantId tiene la prioridad más alta', async () => {
    const res = await hook({
      data: { alt: 'x' },
      req: uploadReq({
        context: { tenantId: 7 },
        headers: { cookie: 'payload-tenant=9' },
        user: { tenants: [{ tenant: { id: 42 } }] },
      }),
    })
    expect((res as { tenant: number }).tenant).toBe(7)
  })

  it('🟨 #113-1: sin context, usa la cookie payload-tenant del admin UI', async () => {
    const res = await hook({
      data: { alt: 'x' },
      req: uploadReq({ headers: { cookie: 'payload-tenant=9' }, user: { tenants: [{ tenant: { id: 42 } }] } }),
    })
    expect((res as { tenant: number }).tenant).toBe(9)
  })

  it('🟨 #113-1: sin context ni cookie, cae al primer tenant del usuario', async () => {
    const res = await hook({ data: { alt: 'x' }, req: uploadReq({ user: { tenants: [{ tenant: 42 }] } }) })
    expect((res as { tenant: number }).tenant).toBe(42)
  })

  it('🟥 #113-5: sin tenant resoluble falla explícito — nunca un PDF sin tenant (leak)', async () => {
    expect(await hookError({ data: { alt: 'x' }, req: uploadReq() })).toMatch(/tenant/)
  })

  it('data.tenant ya poblado pasa intacto (el plugin del flujo con tenant explícito no se toca)', async () => {
    const res = await hook({ data: { alt: 'x', tenant: 3 }, req: uploadReq() })
    expect((res as { tenant: number }).tenant).toBe(3)
  })

  it('updates sin archivo no disparan la validación PDF ni asignan tenant', async () => {
    const res = await hook({ data: { alt: 'nuevo alt' }, req: uploadReq({ file: undefined }) })
    expect(res).toMatchObject({ alt: 'nuevo alt' })
  })
})
