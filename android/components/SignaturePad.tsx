import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, PanResponder, Pressable, Image,
} from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { Theme } from '../lib/theme';
import { OutlineButton } from './DesignSystem';

interface SignaturePadProps {
  value?: string;
  onChange: (dataUrl: string | undefined) => void;
  inkColor?: string;
  height?: number;
}

export default function SignaturePad({
  value,
  onChange,
  inkColor = Theme.primary,
  height = 140,
}: SignaturePadProps) {
  const [strokes, setStrokes] = useState<string[]>([]);
  const currentStroke = useRef<string>('');
  const [hasInk, setHasInk] = useState(false);
  const [containerWidth, setContainerWidth] = useState(320);

  // PanResponder to capture smooth touch gestures without scroll interference
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false, // PREVENTS SCROLLVIEW INTERCEPTION
      onShouldBlockNativeResponder: () => true,

      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const startPoint = `M${locationX.toFixed(1)},${locationY.toFixed(1)}`;
        currentStroke.current = startPoint;
        setStrokes((prev) => [...prev, startPoint]);
        setHasInk(true);
      },

      onPanResponderMove: (evt) => {
        if (!currentStroke.current) return;
        const { locationX, locationY } = evt.nativeEvent;
        currentStroke.current += ` L${locationX.toFixed(1)},${locationY.toFixed(1)}`;
        setStrokes((prev) => {
          if (prev.length === 0) return [currentStroke.current];
          const copy = [...prev];
          copy[copy.length - 1] = currentStroke.current;
          return copy;
        });
      },

      onPanResponderRelease: () => {
        if (currentStroke.current) {
          currentStroke.current = '';
          exportSignature();
        }
      },
    })
  ).current;

  // Export strokes into clean SVG Data URL with transparent background
  const exportSignature = () => {
    setTimeout(() => {
      setStrokes((latestStrokes) => {
        if (latestStrokes.length === 0) {
          onChange(undefined);
          return latestStrokes;
        }

        const pathElements = latestStrokes
          .map((p) => `<path d="${p}" stroke="${inkColor}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`)
          .join('');

        const svgString = `
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${containerWidth || 320} ${height}" width="${containerWidth || 320}" height="${height}">
            ${pathElements}
          </svg>
        `.trim();

        const encoded = encodeURIComponent(svgString)
          .replace(/'/g, '%27')
          .replace(/"/g, '%22');

        const dataUrl = `data:image/svg+xml;utf8,${encoded}`;
        onChange(dataUrl);
        return latestStrokes;
      });
    }, 50);
  };

  const handleClear = () => {
    setStrokes([]);
    currentStroke.current = '';
    setHasInk(false);
    onChange(undefined);
  };

  // If there is already a saved signature and user hasn't started drawing new one
  if (value && strokes.length === 0 && !hasInk) {
    return (
      <View style={st.container}>
        <View style={[st.savedBox, { height }]}>
          <Image source={{ uri: value }} style={st.savedImage} resizeMode="contain" />
        </View>
        <View style={st.savedFooter}>
          <View style={st.savedBadge}>
            <Ionicons name="checkmark-circle" size={16} color={Theme.primary} />
            <Text style={st.savedBadgeText}>Signature Saved · Transparent</Text>
          </View>
          <OutlineButton
            title="Re-sign / Clear"
            icon="refresh-outline"
            size="sm"
            onPress={handleClear}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={st.container}>
      <View
        style={[st.canvasBox, { height }]}
        onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
        {...panResponder.panHandlers}
      >
        <Svg width="100%" height={height} viewBox={`0 0 ${containerWidth} ${height}`}>
          <Rect x="0" y="0" width={containerWidth} height={height} fill="transparent" />
          {strokes.map((p, idx) => (
            <Path
              key={idx}
              d={p}
              stroke={inkColor}
              strokeWidth={3}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </Svg>

        {!hasInk && (
          <View style={st.placeholder} pointerEvents="none">
            <MaterialIcons name="gesture" size={26} color={Theme.onSurfaceDisabled} />
            <Text style={st.placeholderText}>Sign here with your finger</Text>
          </View>
        )}
      </View>

      <View style={st.controls}>
        <Text style={st.hint}>Draws on transparent background for invoices</Text>
        <OutlineButton
          title="Clear Canvas"
          icon="refresh-outline"
          size="sm"
          disabled={!hasInk && strokes.length === 0}
          onPress={handleClear}
        />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  container: {
    marginVertical: 4,
  },
  canvasBox: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: Theme.shapeMd,
    borderWidth: 1.5,
    borderColor: 'rgba(233,196,106,0.25)',
    borderStyle: 'dashed',
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
  },
  placeholder: {
    position: 'absolute',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: Theme.onSurfaceDisabled,
    fontSize: 12,
    marginTop: 6,
    fontWeight: '500',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  hint: {
    color: Theme.onSurfaceVariant,
    fontSize: 11,
    flex: 1,
    marginRight: 8,
  },
  savedBox: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: Theme.shapeMd,
    borderWidth: 1,
    borderColor: Theme.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  savedImage: {
    width: '100%',
    height: '100%',
  },
  savedFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  savedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  savedBadgeText: {
    color: Theme.primary,
    fontSize: 12,
    fontWeight: '600',
  },
});
