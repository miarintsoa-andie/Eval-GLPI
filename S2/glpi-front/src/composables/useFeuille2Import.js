import { ref } from 'vue'
import { glpiApi } from '../services/glpiApi.js'
import { imports as springImports } from '../services/springApi.js'

const TYPE_MAP    = { 'incident': 1, 'demande': 2, 'request': 2 }
const STATUS_MAP  = {
  'new': 1,
  'nouveau': 1,
  'assigned': 2,
  'assigné': 2,
  'in progress': 2,
  'en cours': 2,
  'planning': 3,
  'planifié': 3,
  'pending': 4,
  'en attente': 4,
  'solved': 5,
  'résolu': 5,
  'closed': 6,
  'clos': 6,
  'close': 6
}
const PRIORITY_MAP = { 'very low': 1, 'low': 2, 'medium': 3, 'high': 4, 'very high': 5, 'major': 6 }

function parseGlpiDate(date, heure) {
  if (!date) return undefined
  const [d, m, y] = date.split('/')
  return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')} ${heure || '00:00'}:00`
}

export function useFeuille2Import() {
  const progress = ref(0)
  const total = ref(0)
  const logs = ref([])
  const running = ref(false)

  // Map Ref_Ticket → GLPI ticket ID — partagé avec Feuille 3
  const ticketRefMap = {}

  function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/)
    const sep = lines[0].includes(';') ? ';' : ','
    const headers = lines[0].split(sep).map((h) => h.trim())
    return lines.slice(1).map((line) => {
      const values = []
      let inQuotes = false, cur = ''
      for (const ch of line + sep) {
        if (ch === '"') { inQuotes = !inQuotes; continue }
        if (ch === sep && !inQuotes) { values.push(cur.trim()); cur = ''; continue }
        cur += ch
      }
      return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']))
    })
  }

  async function importFile(file, itemNameMap = {}) {
    running.value = true
    progress.value = 0
    logs.value = []

    const text = await file.text()
    const rows = parseCSV(text)
    total.value = rows.length
    let success = 0, failure = 0

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]

      try {
        const input = {
          name:     row['Titre'],
          content:  row['Description'],
          type:     TYPE_MAP[(row['Type'] || '').toLowerCase()] ?? 1,
          status:   STATUS_MAP[(row['Status'] || '').toLowerCase()] ?? 1,
          priority: PRIORITY_MAP[(row['Priority'] || '').toLowerCase()] ?? 3,
          date:     parseGlpiDate(row['Date'], row['Heure']),
        }

        const created = await glpiApi.createItem('Ticket', input)

        // Stocker la correspondance Ref → ID GLPI
        if (row['Ref_Ticket']) ticketRefMap[row['Ref_Ticket']] = created.id

        // Associer les éléments (Items = JSON array de noms)
        if (row['Items']) {
          let itemNames = []
          try { itemNames = JSON.parse(row['Items']) } catch { /* ignore */ }

          for (const itemName of itemNames) {
            const assoc = itemNameMap[itemName]
            if (assoc) {
              await glpiApi.createItem('Item_Ticket', {
                tickets_id: created.id,
                itemtype: assoc.itemtype,
                items_id: assoc.id,
              }).catch(() => {})
            } else {
              logs.value.push({ status: 'warn', message: `Ticket #${created.id} — élément inconnu : ${itemName}` })
            }
          }
        }

        logs.value.push({ status: 'ok', message: `Ticket #${created.id} — ${row['Titre']}` })
        success++
      } catch (e) {
        logs.value.push({ status: 'error', message: `Ligne ${i + 2} (${row['Titre'] || '?'}) : ${e.message}` })
        failure++
      }

      progress.value = i + 1
    }

    await springImports.create({
      filename: file.name, itemtype: 'Ticket',
      totalRows: rows.length, successCount: success, failureCount: failure,
      status: failure === 0 ? 'COMPLETED' : success === 0 ? 'FAILED' : 'PARTIAL',
    }).catch(() => {})

    running.value = false
    return { success, failure, ticketRefMap }
  }

  return { progress, total, logs, running, importFile, ticketRefMap }
}