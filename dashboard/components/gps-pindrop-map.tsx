'use client';

import React, { useEffect, useRef, useState } from 'react';
import { MapPin, Search, Navigation, Loader2, CheckCircle2 } from 'lucide-react';

interface GpsPinDropMapProps {
  lat: number;
  lon: number;
  radiusKm?: number;
  maxRadiusKm?: number;
  freeRadiusKm?: number;
  onChange: (lat: number, lon: number, resolvedAddress?: string) => void;
}

interface SearchResult {
  display_name: string;
  lat: string;
  lon: string;
}

export const GpsPinDropMap: React.FC<GpsPinDropMapProps> = ({
  lat,
  lon,
  radiusKm,
  maxRadiusKm,
  freeRadiusKm = 15,
  onChange,
}) => {
  const effectiveRadiusKm = radiusKm ?? maxRadiusKm ?? 50;
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerInstanceRef = useRef<any>(null);
  const radiusCircleRef = useRef<any>(null);
  const freeCircleRef = useRef<any>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [resolvedAddress, setResolvedAddress] = useState<string>(
    'Click anywhere on the map or drag the pin to set exact depot coordinates'
  );
  const [locatingGps, setLocatingGps] = useState(false);
  const [leafletReady, setLeafletReady] = useState(false);

  // Load Leaflet CSS & JS from CDN once
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if ((window as any).L) {
      setLeafletReady(true);
      return;
    }

    const existingCss = document.getElementById('leaflet-css-cdn');
    if (!existingCss) {
      const link = document.createElement('link');
      link.id = 'leaflet-css-cdn';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    const existingScript = document.getElementById('leaflet-js-cdn') as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener('load', () => setLeafletReady(true));
      return;
    }

    const script = document.createElement('script');
    script.id = 'leaflet-js-cdn';
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.onload = () => setLeafletReady(true);
    document.body.appendChild(script);
  }, []);

  const reverseGeocode = async (latitude: number, longitude: number) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      if (res.ok) {
        const data = await res.json();
        if (data?.display_name) {
          setResolvedAddress(data.display_name);
          return data.display_name as string;
        }
      }
    } catch {
      // Ignore network errors on reverse geocode
    }
    const fallback = `GPS Pin (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`;
    setResolvedAddress(fallback);
    return fallback;
  };

  // Initialize Leaflet Map
  useEffect(() => {
    if (!leafletReady || !mapContainerRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [lat, lon],
        zoom: 12,
        scrollWheelZoom: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);

      // Custom high-visibility WhatsApp green pin icon
      const pinIcon = L.divIcon({
        className: 'custom-wa-depot-pin',
        html: `<div style="width:34px;height:34px;border-radius:50%;background:#25D366;border:3px solid #06130E;box-shadow:0 4px 14px rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;font-size:18px;">📍</div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });

      const marker = L.marker([lat, lon], {
        draggable: true,
        icon: pinIcon,
      }).addTo(map);

      // Max delivery radius circle (Sky Blue)
      const maxCircle = L.circle([lat, lon], {
        radius: (effectiveRadiusKm || 50) * 1000,
        color: '#38bdf8',
        weight: 2,
        fillColor: '#38bdf8',
        fillOpacity: 0.08,
      }).addTo(map);

      // Free local delivery radius circle (WhatsApp Emerald)
      const freeCircle = L.circle([lat, lon], {
        radius: (freeRadiusKm || 0) * 1000,
        color: '#25D366',
        weight: 2,
        dashArray: '6, 6',
        fillColor: '#25D366',
        fillOpacity: 0.14,
      }).addTo(map);

      // Drag end handler
      marker.on('dragend', async () => {
        const pos = marker.getLatLng();
        const newLat = Number(pos.lat.toFixed(5));
        const newLon = Number(pos.lng.toFixed(5));
        maxCircle.setLatLng([newLat, newLon]);
        freeCircle.setLatLng([newLat, newLon]);
        const addr = await reverseGeocode(newLat, newLon);
        onChange(newLat, newLon, addr);
      });

      // Click anywhere on map to drop pin
      map.on('click', async (e: any) => {
        const newLat = Number(e.latlng.lat.toFixed(5));
        const newLon = Number(e.latlng.lng.toFixed(5));
        marker.setLatLng([newLat, newLon]);
        maxCircle.setLatLng([newLat, newLon]);
        freeCircle.setLatLng([newLat, newLon]);
        const addr = await reverseGeocode(newLat, newLon);
        onChange(newLat, newLon, addr);
      });

      mapInstanceRef.current = map;
      markerInstanceRef.current = marker;
      radiusCircleRef.current = maxCircle;
      freeCircleRef.current = freeCircle;

      reverseGeocode(lat, lon);
      setTimeout(() => map.invalidateSize(), 200);
    }
  }, [leafletReady]);

  // Keep marker & circles synced when lat/lon/radius props change externally
  useEffect(() => {
    if (!mapInstanceRef.current || !markerInstanceRef.current) return;
    const curPos = markerInstanceRef.current.getLatLng();
    if (Math.abs(curPos.lat - lat) > 0.0001 || Math.abs(curPos.lng - lon) > 0.0001) {
      markerInstanceRef.current.setLatLng([lat, lon]);
      mapInstanceRef.current.setView([lat, lon], mapInstanceRef.current.getZoom());
      reverseGeocode(lat, lon);
    }
    if (radiusCircleRef.current) {
      radiusCircleRef.current.setLatLng([lat, lon]);
      radiusCircleRef.current.setRadius((effectiveRadiusKm || 0) * 1000);
    }
    if (freeCircleRef.current) {
      freeCircleRef.current.setLatLng([lat, lon]);
      freeCircleRef.current.setRadius((freeRadiusKm || 0) * 1000);
    }
  }, [lat, lon, effectiveRadiusKm, freeRadiusKm]);

  const handleAddressSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResults([]);
    try {
      const q = encodeURIComponent(searchQuery.trim());
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&countrycodes=za&limit=5&q=${q}`,
        { headers: { 'Accept-Language': 'en' } }
      );
      if (res.ok) {
        const data: SearchResult[] = await res.json();
        setSearchResults(data);
        if (data.length > 0) {
          const first = data[0];
          const newLat = Number(parseFloat(first.lat).toFixed(5));
          const newLon = Number(parseFloat(first.lon).toFixed(5));
          setResolvedAddress(first.display_name);
          onChange(newLat, newLon, first.display_name);
          if (mapInstanceRef.current && markerInstanceRef.current) {
            mapInstanceRef.current.setView([newLat, newLon], 15);
            markerInstanceRef.current.setLatLng([newLat, newLon]);
          }
        }
      }
    } catch {
      // Ignore network error
    } finally {
      setSearching(false);
    }
  };

  const handleUseMyCurrentGps = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    setLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const newLat = Number(pos.coords.latitude.toFixed(5));
        const newLon = Number(pos.coords.longitude.toFixed(5));
        const addr = await reverseGeocode(newLat, newLon);
        onChange(newLat, newLon, addr);
        if (mapInstanceRef.current && markerInstanceRef.current) {
          mapInstanceRef.current.setView([newLat, newLon], 16);
          markerInstanceRef.current.setLatLng([newLat, newLon]);
        }
        setLocatingGps(false);
      },
      () => {
        setLocatingGps(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  return (
    <div className="space-y-3">
      {/* Address Search + Live GPS Button */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddressSearch();
              }
            }}
            placeholder="Search street address, suburb, or town (e.g. 'Mossel Bay', 'Albertinia', '14 Heidelberg Rd')..."
            className="w-full rounded-lg bg-slate-950 border border-slate-700 pl-9 pr-3 py-2 text-xs text-white focus:border-emerald-400 focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={handleAddressSearch}
          disabled={searching}
          className="px-3.5 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-extrabold transition flex items-center justify-center gap-1.5 shrink-0"
        >
          {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}
          Find &amp; Drop Pin
        </button>
        <button
          type="button"
          onClick={handleUseMyCurrentGps}
          disabled={locatingGps}
          className="px-3.5 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold transition flex items-center justify-center gap-1.5 shrink-0"
        >
          {locatingGps ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Navigation className="w-3.5 h-3.5" />
          )}
          🎯 Use My Current GPS
        </button>
      </div>

      {/* Matching Address Dropdown Pills if multiple results found */}
      {searchResults.length > 1 && (
        <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 space-y-1 max-h-28 overflow-y-auto">
          <div className="text-[10px] font-mono uppercase text-slate-400 px-1">
            Select exact matching address to drop pin:
          </div>
          {searchResults.map((item, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                const newLat = Number(parseFloat(item.lat).toFixed(5));
                const newLon = Number(parseFloat(item.lon).toFixed(5));
                setResolvedAddress(item.display_name);
                onChange(newLat, newLon, item.display_name);
                setSearchResults([]);
                if (mapInstanceRef.current && markerInstanceRef.current) {
                  mapInstanceRef.current.setView([newLat, newLon], 16);
                  markerInstanceRef.current.setLatLng([newLat, newLon]);
                }
              }}
              className="w-full text-left px-2 py-1 rounded hover:bg-slate-900 text-xs text-slate-200 truncate flex items-center gap-1.5"
            >
              <MapPin className="w-3 h-3 text-emerald-400 shrink-0" />
              <span className="truncate">{item.display_name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Interactive Map Canvas */}
      <div className="relative rounded-xl overflow-hidden border border-sky-500/40 shadow-inner bg-slate-950">
        <div ref={mapContainerRef} className="w-full h-56 sm:h-64 z-10" />
        <div className="bg-slate-950/95 border-t border-slate-800 px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-1.5 text-emerald-300 font-medium truncate max-w-[70%]">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="truncate">{resolvedAddress}</span>
          </div>
          <div className="flex items-center gap-3 font-mono text-[10px]">
            <span className="text-emerald-400">● Green Circle: Free Local Zone ({freeRadiusKm}km)</span>
            <span className="text-sky-400">● Blue Circle: Max Zone ({effectiveRadiusKm}km)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
