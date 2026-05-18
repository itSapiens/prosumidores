import { Fragment, useEffect, useMemo } from 'react'
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const DEFAULT_CENTER = [39.4699, -0.3763]
const DEFAULT_ZOOM = 8
const PREVIEW_ZOOM = 14
const RADIUS_METERS = 5000

const MAP_OPTIONS = {
  preferCanvas: true,
  zoomSnap: 0.5,
  wheelDebounceTime: 80,
  wheelPxPerZoomLevel: 90,
}

const RANGE_STYLE = {
  color: '#35B8A8',
  fillColor: '#54D9C7',
  fillOpacity: 0.14,
  opacity: 0.9,
  weight: 2,
}

const SELECTED_RANGE_STYLE = {
  ...RANGE_STYLE,
  color: '#000054',
  fillOpacity: 0.2,
  weight: 2.5,
}

const FIT_ALL_OPTIONS = {
  padding: [36, 36],
  maxZoom: 12,
  animate: false,
}

const FIT_PREVIEW_OPTIONS = {
  padding: [18, 18],
  maxZoom: 14,
  animate: false,
}

const VIEW_OPTIONS = {
  animate: false,
}

const INVALIDATE_OPTIONS = {
  debounceMoveend: true,
  pan: false,
  animate: false,
}

const tileLayerProps = {
  attribution: '&copy; OpenStreetMap',
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  updateWhenZooming: false,
  updateWhenIdle: true,
  eventHandlers: {
    tileerror: event => console.warn('No se pudo cargar una tesela del mapa', event),
  },
}

function createInstallationIcon(selected = false) {
  return L.divIcon({
    className: `installation-map-marker${selected ? ' selected' : ''}`,
    html: `
      <span class="installation-map-pin">
        <span class="installation-map-pin-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M4 9.5h16M6.5 5h11L20 17H4L6.5 5Z" />
            <path d="M8.2 5 6.7 17M12 5v12M15.8 5l1.5 12M4 13.2h16" />
            <path d="M9 20h6" />
          </svg>
        </span>
      </span>
    `,
    iconSize: [36, 44],
    iconAnchor: [18, 42],
    popupAnchor: [0, -40],
  })
}

const markerIcon = createInstallationIcon(false)
const selectedMarkerIcon = createInstallationIcon(true)

function toNumber(value) {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function getInstallationPosition(installation) {
  const lat = toNumber(installation?.lat)
  const lng = toNumber(installation?.lng)
  if (lat === null || lng === null) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return [lat, lng]
}

function positionBounds(position) {
  return position ? L.latLng(position).toBounds(RADIUS_METERS * 2) : null
}

function boundsForInstallations(items) {
  return items.reduce((bounds, item) => {
    const nextBounds = positionBounds(item.position)
    if (!nextBounds) return bounds
    return bounds ? bounds.extend(nextBounds) : nextBounds
  }, null)
}

function MapResizer() {
  const map = useMap()

  useEffect(() => {
    const container = map.getContainer()
    let frame = 0

    const invalidate = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => map.invalidateSize(INVALIDATE_OPTIONS))
    }

    invalidate()

    if (!window.ResizeObserver) {
      window.addEventListener('resize', invalidate)
      return () => {
        window.cancelAnimationFrame(frame)
        window.removeEventListener('resize', invalidate)
      }
    }

    const observer = new ResizeObserver(invalidate)
    observer.observe(container)
    window.addEventListener('resize', invalidate)

    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', invalidate)
    }
  }, [map])

  return null
}

function MapUpdater({ center, zoom = DEFAULT_ZOOM, bounds, fitOptions = FIT_ALL_OPTIONS }) {
  const map = useMap()

  useEffect(() => {
    if (bounds) map.fitBounds(bounds, fitOptions)
  }, [bounds, fitOptions, map])

  useEffect(() => {
    if (!bounds && center) map.setView(center, zoom, VIEW_OPTIONS)
  }, [bounds, center, map, zoom])

  return null
}

function ResetViewControl({ center, bounds }) {
  const map = useMap()

  return (
    <button
      type="button"
      className="installation-map-reset"
      onClick={() => {
        if (bounds) map.fitBounds(bounds, FIT_ALL_OPTIONS)
        else if (center) map.setView(center, DEFAULT_ZOOM, VIEW_OPTIONS)
      }}
    >
      Recentrar
    </button>
  )
}

function InstallationCircle({ position, selected = false }) {
  return (
    <Circle
      center={position}
      radius={RADIUS_METERS}
      pathOptions={selected ? SELECTED_RANGE_STYLE : RANGE_STYLE}
      interactive={false}
    />
  )
}

function InstallationMarker({ installation, position, selected = false, onSelect }) {
  return (
    <Marker
      position={position}
      icon={selected ? selectedMarkerIcon : markerIcon}
      eventHandlers={onSelect ? { click: () => onSelect(installation) } : undefined}
      riseOnHover
    >
      <Popup>
        <div className="installation-map-popup">
          <strong>{installation.nombre_instalacion}</strong>
          <span>Radio de actuación: 5 km</span>
        </div>
      </Popup>
    </Marker>
  )
}

function TileLayerBase() {
  return <TileLayer {...tileLayerProps} />
}

export function InstallationPreviewMap({ lat, lng, title = 'Ubicación de la instalación' }) {
  const center = getInstallationPosition({ lat, lng })
  const bounds = useMemo(() => positionBounds(center), [center])

  return (
    <div className="installation-map-preview">
      {center ? (
        <MapContainer
          {...MAP_OPTIONS}
          center={center}
          zoom={PREVIEW_ZOOM}
          scrollWheelZoom={false}
          className="installation-map"
        >
          <MapResizer />
          <MapUpdater center={center} zoom={PREVIEW_ZOOM} bounds={bounds} fitOptions={FIT_PREVIEW_OPTIONS} />
          <TileLayerBase />
          <InstallationCircle position={center} selected />
          <Marker position={center} icon={selectedMarkerIcon} riseOnHover>
            <Popup>{title}</Popup>
          </Marker>
        </MapContainer>
      ) : (
        <div className="installation-map-empty">
          Introduce latitud y longitud válidas para ver la ubicación.
        </div>
      )}
    </div>
  )
}

export function InstallationsMap({ installations, selectedId, onSelect }) {
  const validInstallations = useMemo(() => {
    return (installations || [])
      .map(installation => ({ installation, position: getInstallationPosition(installation) }))
      .filter(item => item.position)
  }, [installations])

  const bounds = useMemo(() => boundsForInstallations(validInstallations), [validInstallations])
  const selected = validInstallations.find(item => item.installation.id === selectedId)
  const center = selected?.position || validInstallations[0]?.position || DEFAULT_CENTER
  const sortedInstallations = useMemo(() => {
    return [...validInstallations].sort((a, b) => {
      if (a.installation.id === selectedId) return 1
      if (b.installation.id === selectedId) return -1
      return 0
    })
  }, [selectedId, validInstallations])

  return (
    <MapContainer
      {...MAP_OPTIONS}
      center={center}
      zoom={DEFAULT_ZOOM}
      scrollWheelZoom
      className="installation-map installation-map-large"
    >
      <MapResizer />
      <MapUpdater center={center} bounds={bounds} />
      <ResetViewControl center={center} bounds={bounds} />
      <TileLayerBase />
      {sortedInstallations.map(({ installation, position }) => {
        const isSelected = installation.id === selectedId
        return (
          <Fragment key={installation.id}>
            <InstallationCircle position={position} selected={isSelected} />
            <InstallationMarker
              installation={installation}
              position={position}
              selected={isSelected}
              onSelect={onSelect}
            />
          </Fragment>
        )
      })}
    </MapContainer>
  )
}
