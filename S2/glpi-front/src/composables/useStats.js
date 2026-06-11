import { ref } from 'vue'
import { glpiApi } from '../services/glpiApi.js'

export function useStats() {
  const stats = ref({})
  const loading = ref(false)
  const lastUpdate = ref(null)

  const ASSET_TYPES = [
    { key: 'Computer',        label: 'Ordinateurs' },
    { key: 'Monitor',         label: 'Moniteurs' },
    { key: 'NetworkEquipment',label: 'Réseau' },
    { key: 'Software',        label: 'Logiciels' },
    { key: 'Printer',         label: 'Imprimantes' },
    { key: 'Phone',           label: 'Téléphones' },
    { key: 'Document',        label: 'Documents' },
  ]

  // Statuts tickets à compter séparément
  const TICKET_STATUSES = [
    { key: 1, label: 'Nouveaux' },
    { key: 2, label: 'Assignés' },
    { key: 4, label: 'En attente' },
    { key: 5, label: 'Résolus' },
    { key: 6, label: 'Clos' },
  ]

  async function fetchCount(itemtype, params = {}) {
    try {
      const { total } = await glpiApi.getItemsRaw(itemtype, {
        range: '0-0',
        only_id: '1',
        ...params,
      })
      return { total, error: false }
    } catch {
      return { total: 0, error: true }
    }
  }

  async function loadAll() {
    loading.value = true

    // Compteurs assets en parallèle
    const assetResults = await Promise.all(
      ASSET_TYPES.map(async ({ key, label }) => {
        const { total, error } = await fetchCount(key)
        return { key, label, total, error }
      })
    )
//     Ce bloc parcourt chaque type d’asset (ordinateur, imprimante, etc.), lance en parallèle un comptage avec fetchCount, et construit un tableau assetResults avec pour chaque type :

// son identifiant (key),

// son libellé (label),

// le nombre (total),

// et l’état (error).

    // Compteur total tickets + par statut
    const [ticketTotal, ...ticketByStatus] = await Promise.all([
      fetchCount('Ticket'),
      ...TICKET_STATUSES.map(async ({ key, label }) => {
        // GLPI filtre par statut via le paramètre `searchText` ou criteria
        // Méthode simple : charger tous les tickets et filtrer côté client si volume faible
        // Pour de gros volumes, utiliser l'API de recherche GLPI
        const { total, error } = await fetchCount('Ticket', { 'criteria[0][field]': 12, 'criteria[0][value]': key })
        return { key, label, total, error }
      }),
    ])

    stats.value = {
      assets: assetResults,
      assetTotal: assetResults.reduce((sum, a) => sum + a.total, 0),
      //  additionne tous les total des assets./  ajoute le champ total de chaque élément.,valeur initial
      tickets: ticketByStatus,
      ticketTotal: ticketTotal.total,
    }

    lastUpdate.value = new Date().toLocaleTimeString('fr-FR')
    loading.value = false
  }

  return { stats, loading, lastUpdate, loadAll, ASSET_TYPES }
}