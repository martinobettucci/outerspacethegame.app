-- 014 — Horloges de survie & derelict (GB §6, DG §3.5/§8.8).
-- Réservoir de survie PARESSEUX (motif fuel du 008) : `survival` (jsonb,
-- existant depuis 001) + taux/as_of matérialisés au rebase ; l'alarme à
-- 25 % (auto-flee-home désarmable) et le bord survival_out vivent dans la
-- file d'événements. Le survival-out TUE l'équipage (host-fate canon) et
-- DÉPOUILLE la propriété : owner_id devient nullable (derelict = épave
-- sans maître, récupérable par salvage — claims avec les items P4).
ALTER TABLE ships ALTER COLUMN owner_id DROP NOT NULL;
ALTER TABLE ships ADD COLUMN survival_rate_t_per_day double precision NOT NULL DEFAULT 0;
ALTER TABLE ships ADD COLUMN survival_as_of timestamptz;
-- Politique anti-extorsion (DG §3.5) : auto-flee-home ARMÉE par défaut.
ALTER TABLE ships ADD COLUMN flee_armed boolean NOT NULL DEFAULT true;
