import { Navigation, Orbit, Rocket } from 'lucide-react';
import type { GalaxyBody, ShipView } from '../api.js';
import { useGameClock } from '../hooks/useGameClock.ts';
import { OperationTimer } from './OperationTimer.tsx';
import '../styles/fleet-operations.css';

function bodyAt(
  bodies: readonly GalaxyBody[],
  x: number,
  y: number,
): GalaxyBody | undefined {
  return bodies.find(
    (body) => Math.abs(body.x - x) < 0.001 && Math.abs(body.y - y) < 0.001,
  );
}

function coordinateLabel(x: number, y: number): string {
  return `${x.toFixed(1)}, ${y.toFixed(1)} pc`;
}

function dueAt(ship: ShipView): string | null {
  return ship.mission?.arrivesAt ?? ship.establishesAt;
}

export function FleetOperations({
  ships,
  bodies,
  selectedShipId,
  onSelect,
}: {
  ships: readonly ShipView[];
  bodies: readonly GalaxyBody[];
  selectedShipId?: string | null;
  onSelect: (ship: ShipView) => void;
}) {
  const now = useGameClock();
  const active = ships
    .filter((ship) => dueAt(ship) !== null)
    .sort(
      (a, b) =>
        Date.parse(dueAt(a) ?? '') - Date.parse(dueAt(b) ?? ''),
    );

  if (active.length === 0) return null;

  return (
    <section className="fleet-operations" aria-label="Active fleet operations">
      <header className="fleet-operations__header">
        <span>
          <Navigation size={13} aria-hidden /> Fleet telemetry
        </span>
        <strong>{active.length} active</strong>
      </header>

      <div className="fleet-operations__list">
        {active.slice(0, 4).map((ship) => {
          const mission = ship.mission;
          const destination = mission
            ? mission.destBodyId
              ? bodies.find((body) => body.id === mission.destBodyId)?.name ??
                coordinateLabel(mission.destX, mission.destY)
              : coordinateLabel(mission.destX, mission.destY)
            : bodies.find(
                (body) => body.id === ship.hoverBodyId || body.id === ship.dockedBodyId,
              )?.name ?? coordinateLabel(ship.x, ship.y);
          const origin = mission
            ? bodyAt(bodies, mission.originX, mission.originY)?.name ??
              coordinateLabel(mission.originX, mission.originY)
            : 'Orbital hold';
          const start = mission ? Date.parse(mission.departedAt) : Number.NaN;
          const end = mission ? Date.parse(mission.arrivesAt) : Number.NaN;
          const progress = Number.isFinite(start) && Number.isFinite(end)
            ? Math.min(1, Math.max(0, (now - start) / Math.max(1, end - start)))
            : null;
          const deadline = dueAt(ship)!;

          return (
            <button
              key={ship.id}
              type="button"
              className="fleet-operation"
              data-selected={selectedShipId === ship.id || undefined}
              onClick={() => onSelect(ship)}
              aria-label={`Track ${ship.name}, ${ship.status}, destination ${destination}`}
            >
              <span className="fleet-operation__icon" aria-hidden="true">
                {ship.hullCategory === 'probe' ? (
                  <Orbit size={14} />
                ) : (
                  <Rocket size={14} />
                )}
              </span>
              <span className="fleet-operation__route">
                <strong>{ship.name}</strong>
                <span>
                  {origin} <i aria-hidden="true">→</i> {destination}
                </span>
                {progress !== null && (
                  <span
                    className="fleet-operation__progress"
                    role="progressbar"
                    aria-label={`${ship.name} flight progress`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(progress * 100)}
                  >
                    <i style={{ transform: `scaleX(${progress})` }} />
                  </span>
                )}
              </span>
              <OperationTimer
                completesAt={deadline}
                label={mission ? 'Arrival' : 'Colony link'}
                tone={mission ? 'violet' : 'warning'}
                compact
              />
            </button>
          );
        })}
      </div>
    </section>
  );
}
