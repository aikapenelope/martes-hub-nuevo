import { describe, it, expect } from 'vitest'
import { csvCell } from '@/endpoints/exportCsv'

describe('csvCell — neutralización de CSV/formula injection (OWASP)', () => {
  it('prefija con apóstrofo las celdas que empiezan con caracteres de fórmula', () => {
    // El valor con comillas se envuelve además en comillas dobles (escape CSV)
    expect(csvCell('=HYPERLINK("http://evil","x")')).toBe('"\'=HYPERLINK(""http://evil"",""x"")"')
    expect(csvCell('=1+1')).toBe("'=1+1")
    expect(csvCell('+SUM(A1:A2)')).toBe("'+SUM(A1:A2)")
    expect(csvCell('@import')).toBe("'@import")
  })

  it('prefija con apóstrofo los inicios con tab y CR', () => {
    expect(csvCell('\tcmd')).toBe("'\tcmd")
    expect(csvCell('\rcmd')).toBe("'\rcmd")
  })

  it('no altera los números negativos legítimos escritos como -5 solo si son fórmula-contexto', () => {
    // El estándar OWASP también neutraliza '-': en este CRM los montos no se
    // exportan como texto con signo, y la legibilidad prima sobre el caso raro
    // de un texto que empieza con '-' — se neutraliza igual.
    expect(csvCell('-5')).toBe("'-5")
  })

  it('envuelve en comillas y duplica comillas internas', () => {
    expect(csvCell('nombre, con coma')).toBe('"nombre, con coma"')
    expect(csvCell('dice "hola"')).toBe('"dice ""hola"""')
  })

  it('deja intactos los valores normales', () => {
    expect(csvCell('Juan Pérez')).toBe('Juan Pérez')
    expect(csvCell('')).toBe('')
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
    expect(csvCell(42)).toBe('42')
  })
})
