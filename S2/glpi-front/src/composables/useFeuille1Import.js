// src/composables/useFeuille1Import.js
import { ref } from 'vue'
import { glpiApi } from '../services/glpiApi.js'
import { imports as springImports } from '../services/springApi.js'
import { lookupOrCreate, lookupUser } from './useGlpiLookup.js'

const TYPE_MAP = {
    'incident': 1, 'demande': 2, 'ticket': 1,
    'computer': 'Computer', 'monitor': 'Monitor',
    'networkequipment': 'NetworkEquipment',
    'printer': 'Printer', 'phone': 'Phone',
}

const MODEL_FIELD = {
    'Computer': 'computermodels_id', 'Monitor': 'monitormodels_id',
    'NetworkEquipment': 'networkequipmentmodels_id',
    'Printer': 'printermodels_id', 'Phone': 'phonemodels_id',
}

export function useFeuille1Import() {
    const progress = ref(0)
    const total = ref(0)
    const logs = ref([])
    const running = ref(false)

    // Map nom → { itemtype, id } — partagé avec Feuille 2
    const itemNameMap = {}

    function parseCSV(text) {
        const lines = text.trim().split(/\r?\n/)
        const sep = lines[0].includes(';') ? ';' : ','
        const headers = lines[0].split(sep).map((h) => h.trim())
        return lines.slice(1).map((line, idx) => {
            // Gestion des virgules dans les chaînes entre guillemets
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

    async function importFile(file) {
        running.value = true
        progress.value = 0
        logs.value = []

        const text = await file.text()
        const rows = parseCSV(text)
        total.value = rows.length
        let success = 0, failure = 0

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i]
            const rawItemType = (row['Item_Type'] || '').trim().toLowerCase()
            const itemtype = TYPE_MAP[rawItemType] || 'Computer' // Fallback safe

            if (!itemtype || !row['Name']) {
                logs.value.push({ status: 'error', message: `Ligne ${i + 2} : Name ou Item_Type manquant` })
                failure++
                progress.value = i + 1
                continue
            }

            try {
                // Résolution des FK en parallèle
                const [stateId, locationId, manufacturerId, modelId, userId] = await Promise.all([
                    lookupOrCreate('State', row['Status']),
                    lookupOrCreate('Location', row['Location']),
                    lookupOrCreate('Manufacturer', row['Manufacturer']),
                    lookupOrCreate(itemtype + 'Model', row['Model']),
                    lookupUser(row['User']),
                ])

                const input = {
                    name: row['Name'],
                    otherserial: row['Inventory_Number'] || '',
                    states_id: stateId,
                    locations_id: locationId,
                    manufacturers_id: manufacturerId,
                    users_id_tech: userId,
                    [MODEL_FIELD[itemtype] || 'comment']: MODEL_FIELD[itemtype] ? modelId : row['Model'],
                }

                const created = await glpiApi.createItem(itemtype, input)
                itemNameMap[row['Name']] = { itemtype, id: created.id }
                logs.value.push({ status: 'ok', message: `${itemtype} #${created.id} — ${row['Name']}` })
                success++
            } catch (e) {
                logs.value.push({ status: 'error', message: `${row['Name']} : ${e.message}` })
                failure++
            }

            progress.value = i + 1
        }

        await springImports.create({
            filename: file.name, itemtype: 'Multi',
            totalRows: rows.length, successCount: success, failureCount: failure,
            status: failure === 0 ? 'COMPLETED' : success === 0 ? 'FAILED' : 'PARTIAL',
        }).catch(() => { })

        running.value = false
        return { success, failure, itemNameMap }
    }

    return { progress, total, logs, running, importFile, itemNameMap }
}