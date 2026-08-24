ALTER TABLE "tenants" ADD COLUMN "web_order_channels" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
-- Travaso: quello che era in colonna finisce nel blocco del suo canale. Senza,
-- ogni locale che aveva gia' acceso l'asporto dal sito lo troverebbe spento.
UPDATE "tenants" SET "web_order_channels" = jsonb_build_object(
  'asporto', jsonb_build_object(
    'attivo', "web_order_takeaway",
    'passoMinuti', "web_order_slot_minutes",
    'preavvisoMinuti', "web_order_takeaway_lead_minutes",
    'giorniAvanti', "web_order_horizon_days",
    'minimoCents', 0,
    'accettazioneAutomatica', "web_order_auto_accept",
    'nota', "web_order_note"
  ),
  'domicilio', jsonb_build_object(
    'attivo', "web_order_delivery",
    'passoMinuti', "web_order_slot_minutes",
    'preavvisoMinuti', "web_order_delivery_lead_minutes",
    'giorniAvanti', "web_order_horizon_days",
    'minimoCents', 0,
    'accettazioneAutomatica', "web_order_auto_accept",
    'nota', "web_order_note"
  )
);
