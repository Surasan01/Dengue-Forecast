import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { District } from '../data/districts';

// Fix for default marker icons in Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface MapViewProps {
  districts: District[];
  selectedDistrict: District | null;
  onSelectDistrict: (district: District) => void;
}

export function MapView({ districts, selectedDistrict, onSelectDistrict }: MapViewProps) {
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());

  useEffect(() => {
    if (!mapRef.current) {
      // Initialize map centered on the region
      const map = L.map('map').setView([14.5, 100.6], 9);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      mapRef.current = map;
    }

    // Clear existing markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current.clear();

    // Add markers for all districts
    districts.forEach(district => {
      const isSelected = selectedDistrict?.district_id_txt_clean === district.district_id_txt_clean;
      
      const icon = L.divIcon({
        className: 'custom-marker',
        html: `<div class="marker-pin ${isSelected ? 'selected' : ''}" style="
          width: ${isSelected ? '32px' : '24px'};
          height: ${isSelected ? '32px' : '24px'};
          background: ${isSelected ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'};
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          cursor: pointer;
          transition: all 0.3s ease;
        "></div>`,
        iconSize: [isSelected ? 32 : 24, isSelected ? 32 : 24],
        iconAnchor: [isSelected ? 16 : 12, isSelected ? 16 : 12],
      });

      const marker = L.marker([district.lat, district.lon], { icon })
        .bindTooltip(district.district_id_txt_clean, {
          permanent: false,
          direction: 'top',
          className: 'custom-tooltip',
        })
        .on('click', () => onSelectDistrict(district))
        .addTo(mapRef.current!);

      markersRef.current.set(district.district_id_txt_clean, marker);
    });

    // Pan to selected district
    if (selectedDistrict) {
      mapRef.current.setView([selectedDistrict.lat, selectedDistrict.lon], 11, {
        animate: true,
      });
    }

    return () => {
      // Cleanup on unmount
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [districts, selectedDistrict, onSelectDistrict]);

  return (
    <div className="h-full w-full rounded-xl overflow-hidden shadow-xl border-2 border-gray-200 dark:border-gray-700">
      <div id="map" className="h-full w-full" />
    </div>
  );
}
