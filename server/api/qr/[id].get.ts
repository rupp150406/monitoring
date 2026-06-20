/**
 * server/api/qr/[id].get.ts
 * H3 endpoint for QR code validation / grup lookup.
 *
 * GET /api/qr/:qrCodeString
 *
 * Returns the grup_hewan row (without sohibul_qurban join) for a given
 * qr_code_string.  Used by the PWA scan page as an alternative to calling
 * Supabase directly from the client — useful when you want to add server-side
 * rate-limiting or auth checks in the future.
 *
 * Response 200: { data: GrupHewan }
 * Response 404: { error: 'not_found' }
 * Response 500: { error: string }
 */

import { defineEventHandler, getRouterParam, createError } from 'h3'
import { serverSupabaseClient } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const qrCodeString = getRouterParam(event, 'id')

  if (!qrCodeString) {
    throw createError({ statusCode: 400, statusMessage: 'Missing QR code parameter' })
  }

  const supabase = await serverSupabaseClient(event)

  const { data, error } = await supabase
    .from('grup_hewan')
    .select(`
      id_grup,
      jenis_hewan,
      label_tampilan,
      status_kedatangan,
      status_sembelihan,
      status_pengulitan,
      status_pengemasan,
      sembelih_selesai_at,
      pengulitan_selesai_at,
      is_timer_active,
      qr_code_string,
      updated_by,
      sohibul_qurban ( id, nama )
    `)
    .eq('qr_code_string', qrCodeString)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      // PostgREST "not found" code for .single() with no rows
      throw createError({ statusCode: 404, statusMessage: 'QR code not found' })
    }
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { data }
})