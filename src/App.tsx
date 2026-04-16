import React, { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { 
  Settings2, Camera, Video, Play, Pause, Square, 
  PanelLeftClose, PanelLeftOpen, ChevronDown 
} from 'lucide-react';

// --- Helper Functions & Constants ---

const getContrastColor = (hexcolor: string) => {
  hexcolor = hexcolor.replace("#", "");
  const r = parseInt(hexcolor.substr(0, 2), 16);
  const g = parseInt(hexcolor.substr(2, 2), 16);
  const b = parseInt(hexcolor.substr(4, 2), 16);
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return (yiq >= 128) ? '#1f2937' : '#f9fafb';
};

const SHAPE_META = {
  rose: {
    name: 'PARAMETRIC ROSE',
    formula: 'r = sin(4v + t) * cos(5u + t) * 2.5 + sin(2v - t)'
  },
  knot: {
    name: 'QUANTUM KNOT',
    formula: 'k(u) = sin(u) + 2sin(2u) + twisted ribbon'
  },
  mobius: {
    name: 'MÖBIUS WAVE',
    formula: 'w = v * 1.5 * (1 + 0.2 * sin(10u - 2t))'
  },
  parabolic: {
    name: 'GOING PARABOLIC',
    formula: 'y = u³, r = u² (Exponential Flare)'
  },
  lightspeed: {
    name: 'LIGHTSPEED',
    formula: 'Warp Tunnel: r = 0.5 + 3.5|u|⁴ + streaks'
  }
};

// --- Sub-components ---

const CaptureManager = ({ captureRef }: { captureRef: React.MutableRefObject<any> }) => {
  const gl = useThree((state) => state.gl);
  
  useEffect(() => {
    captureRef.current = {
      takeScreenshot: () => {
        const url = gl.domElement.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `parametric-capture-${Date.now()}.png`;
        link.href = url;
        link.click();
      },
      startRecording: () => {
        // @ts-ignore
        const stream = gl.domElement.captureStream(30);
        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
        const chunks: BlobPart[] = [];
        
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'video/webm' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.download = `parametric-recording-${Date.now()}.webm`;
          link.href = url;
          link.click();
        };
        
        recorder.start();
        return recorder;
      }
    };
  }, [gl, captureRef]);
  
  return null;
};

const ParametricShape = ({ 
  isPlaying, 
  speed, 
  lineColor,
  shapeId,
  useLighting
}: { 
  isPlaying: boolean; 
  speed: number; 
  lineColor: string;
  shapeId: string;
  useLighting: boolean;
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const lineGeoRef = useRef<THREE.BufferGeometry>(null);
  const surfaceGeoRef = useRef<THREE.BufferGeometry>(null);
  const customTime = useRef(0);

  // Reduced slightly to maintain 60fps when computing normals every frame
  const uSteps = 150;
  const vSteps = 150;

  const { lineIndices, triIndices, sharedPositions } = useMemo(() => {
    const positions = new Float32Array((uSteps + 1) * (vSteps + 1) * 3);
    const lIndices = [];
    const tIndices = [];

    for (let i = 0; i < uSteps; i++) {
      for (let j = 0; j < vSteps; j++) {
        const a = i * (vSteps + 1) + j;
        const b = a + 1;
        const c = (i + 1) * (vSteps + 1) + j;
        const d = c + 1;
        
        lIndices.push(a, b);
        lIndices.push(a, c);
        
        tIndices.push(a, c, b);
        tIndices.push(b, c, d);
      }
    }

    return { lineIndices: lIndices, triIndices: tIndices, sharedPositions: positions };
  }, [uSteps, vSteps]);

  useFrame((state, delta) => {
    if (isPlaying) {
      customTime.current += delta * speed;
    }
    
    const time = customTime.current;
    let idx = 0;

    for (let i = 0; i <= uSteps; i++) {
      const u = (i / uSteps) * Math.PI;
      for (let j = 0; j <= vSteps; j++) {
        const v = (j / vSteps) * Math.PI * 2;
        let x = 0, y = 0, z = 0;

        if (shapeId === 'rose') {
          const r = 
            Math.sin(4 * v + time * 0.4) * Math.cos(5 * u + time * 0.3) * 2.5 + 
            Math.sin(2 * v - time * 0.2) * 1.0;
          x = r * Math.sin(u) * Math.cos(v);
          y = r * Math.sin(u) * Math.sin(v);
          z = r * Math.cos(u);
        } else if (shapeId === 'knot') {
          const U = u * 2; // 0 to 2PI
          const V = v;     // 0 to 2PI
          
          // Deforming Trefoil knot core
          const kx = Math.sin(U + time * 0.5) + 2 * Math.sin(2 * U - time * 0.3);
          const ky = Math.cos(U + time * 0.5) - 2 * Math.cos(2 * U - time * 0.3);
          const kz = -Math.sin(3 * U + time * 0.4);
          
          // Twisting ribbon offset
          const twist = U * 4 + time;
          const rx = 0.6 * Math.cos(V) * Math.cos(twist);
          const ry = 0.6 * Math.cos(V) * Math.sin(twist);
          const rz = 0.6 * Math.sin(V);

          x = kx + rx;
          y = ky + ry;
          z = kz + rz;
        } else if (shapeId === 'mobius') {
          const U = u * 2; // 0 to 2PI
          const V = (v / Math.PI) - 1; // -1 to 1
          const width = V * 1.5 * (1 + 0.2 * Math.sin(10 * U - time * 2));
          const R = 2.0;
          x = (R + width * Math.cos(U / 2 + time * 0.5)) * Math.cos(U);
          y = (R + width * Math.cos(U / 2 + time * 0.5)) * Math.sin(U);
          z = width * Math.sin(U / 2 + time * 0.5);
        } else if (shapeId === 'parabolic') {
          const tu = u / Math.PI; // 0 to 1
          const V = v;            // 0 to 2PI
          
          // "Going Parabolic" - shoots upwards exponentially
          const height = 5 * Math.pow(tu, 3) - 2.0; 
          const radius = 3 * Math.pow(tu, 2);
          
          // Twisting star-like cross section
          const rMod = radius * (1 + 0.2 * Math.sin(6 * V - time * 3));
          const twist = tu * 5 + time * 0.5;
          
          x = rMod * Math.cos(V + twist);
          y = height;
          z = rMod * Math.sin(V + twist);
        } else if (shapeId === 'lightspeed') {
          const U = (u / Math.PI) * 2 - 1; // -1 to 1
          const V = v;                     // 0 to 2PI
          
          // Flare out at the ends like a wormhole
          const radius = 0.5 + 3.5 * Math.pow(Math.abs(U), 4);
          
          // Hyper-fast forward ripples
          const ripple = 0.1 * Math.sin(30 * U - time * 35);
          
          // "Light streaks" wrapping around the tunnel
          const streaks = 1.0 + 0.15 * Math.sin(16 * V + time * 15);
          
          const rFinal = (radius + ripple * (1.0 + Math.abs(U) * 2.0)) * streaks;
          
          // Dynamic vortex twist
          const twist = V + U * 2.5 * Math.cos(time * 1.5) - time * 4.0;
          
          x = rFinal * Math.cos(twist);
          y = rFinal * Math.sin(twist);
          z = U * 6.0;
        }

        sharedPositions[idx++] = x;
        sharedPositions[idx++] = y;
        sharedPositions[idx++] = z;
      }
    }

    if (lineGeoRef.current) {
      lineGeoRef.current.attributes.position.needsUpdate = true;
    }
    
    if (surfaceGeoRef.current && useLighting) {
      surfaceGeoRef.current.attributes.position.needsUpdate = true;
      surfaceGeoRef.current.computeVertexNormals();
    }

    if (groupRef.current && isPlaying) {
      groupRef.current.rotation.y += delta * 0.15 * speed;
      groupRef.current.rotation.x += delta * 0.1 * speed;
    }
  });

  return (
    <group ref={groupRef}>
      <lineSegments>
        <bufferGeometry ref={lineGeoRef}>
          <bufferAttribute
            attach="attributes-position"
            count={sharedPositions.length / 3}
            array={sharedPositions}
            itemSize={3}
          />
          <bufferAttribute
            attach="index"
            count={lineIndices.length}
            array={new Uint32Array(lineIndices)}
            itemSize={1}
          />
        </bufferGeometry>
        <lineBasicMaterial 
          color={lineColor} 
          transparent 
          opacity={useLighting ? 0.05 : 0.15} 
          linewidth={1} 
          blending={THREE.NormalBlending}
        />
      </lineSegments>
      
      <mesh visible={useLighting}>
        <bufferGeometry ref={surfaceGeoRef}>
          <bufferAttribute
            attach="attributes-position"
            count={sharedPositions.length / 3}
            array={sharedPositions}
            itemSize={3}
          />
          <bufferAttribute
            attach="index"
            count={triIndices.length}
            array={new Uint32Array(triIndices)}
            itemSize={1}
          />
        </bufferGeometry>
        <meshStandardMaterial 
          color={lineColor} 
          side={THREE.DoubleSide} 
          transparent 
          opacity={0.8} 
          roughness={0.3} 
          metalness={0.2} 
        />
      </mesh>
    </group>
  );
};

// --- Main App Component ---

export default function App() {
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [shapeId, setShapeId] = useState('rose');
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [lineColor, setLineColor] = useState('#4a4a4a');
  const [bgColor, setBgColor] = useState('#f8f9fa');
  const [useLighting, setUseLighting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  const captureRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const handleScreenshot = () => {
    captureRef.current?.takeScreenshot();
  };

  const toggleRecording = () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      const recorder = captureRef.current?.startRecording();
      if (recorder) {
        mediaRecorderRef.current = recorder;
        setIsRecording(true);
      }
    }
  };

  const textColor = getContrastColor(bgColor);
  const currentMeta = SHAPE_META[shapeId as keyof typeof SHAPE_META];

  return (
    <div className="flex w-full h-screen overflow-hidden font-sans" style={{ backgroundColor: bgColor }}>
      
      {/* --- Sidebar Panel --- */}
      <div 
        className={`flex-shrink-0 bg-white/90 backdrop-blur-xl border-r border-gray-200 shadow-2xl transition-all duration-300 ease-in-out z-10 ${
          isPanelOpen ? 'w-80' : 'w-0'
        }`}
      >
        <div className="w-80 p-6 h-full overflow-y-auto flex flex-col gap-8">
          
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <Settings2 size={20} /> Controls
            </h2>
            <button 
              onClick={() => setIsPanelOpen(false)} 
              className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors"
              title="Close Panel"
            >
              <PanelLeftClose size={20} />
            </button>
          </div>

          {/* Shape Controls */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Shape</h3>
            <div className="relative">
              <select 
                value={shapeId} 
                onChange={(e) => setShapeId(e.target.value)}
                className="w-full appearance-none bg-gray-50 border border-gray-200 text-gray-700 py-2.5 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent font-medium text-sm cursor-pointer"
              >
                <option value="rose">Parametric Rose</option>
                <option value="knot">Quantum Knot</option>
                <option value="mobius">Möbius Wave</option>
                <option value="parabolic">Going Parabolic</option>
                <option value="lightspeed">Lightspeed Warp</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-500">
                <ChevronDown size={16} />
              </div>
            </div>
          </div>
          
          {/* Animation Controls */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Animation</h3>
            
            <button 
              onClick={() => setIsPlaying(!isPlaying)}
              className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white py-2.5 px-4 rounded-lg hover:bg-gray-800 transition-colors shadow-sm"
            >
              {isPlaying ? <Pause size={18} /> : <Play size={18} />}
              <span className="font-medium">{isPlaying ? 'Pause Animation' : 'Play Animation'}</span>
            </button>
            
            <div className="space-y-2 pt-2">
              <div className="flex justify-between text-sm text-gray-600 font-medium">
                <span>Speed</span>
                <span>{speed.toFixed(1)}x</span>
              </div>
              <input 
                type="range" 
                min="0.1" max="3" step="0.1" 
                value={speed} 
                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-900"
              />
            </div>
          </div>

          {/* Appearance Controls */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Appearance</h3>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-100">
                <span className="text-sm font-medium text-gray-700">Line Color</span>
                <div className="relative w-8 h-8 rounded-md overflow-hidden shadow-sm border border-gray-200">
                  <input 
                    type="color" 
                    value={lineColor} 
                    onChange={(e) => setLineColor(e.target.value)}
                    className="absolute -top-2 -left-2 w-12 h-12 cursor-pointer"
                  />
                </div>
              </div>
              
              <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-100">
                <span className="text-sm font-medium text-gray-700">Background</span>
                <div className="relative w-8 h-8 rounded-md overflow-hidden shadow-sm border border-gray-200">
                  <input 
                    type="color" 
                    value={bgColor} 
                    onChange={(e) => setBgColor(e.target.value)}
                    className="absolute -top-2 -left-2 w-12 h-12 cursor-pointer"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-100">
                <span className="text-sm font-medium text-gray-700">Enable Lighting</span>
                <button 
                  onClick={() => setUseLighting(!useLighting)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${useLighting ? 'bg-gray-900' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${useLighting ? 'translate-x-5' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>
          </div>

          {/* Capture Controls */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Capture</h3>
            
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={handleScreenshot}
                className="flex flex-col items-center justify-center gap-2 bg-gray-50 border border-gray-200 text-gray-700 py-4 px-4 rounded-xl hover:bg-gray-100 hover:border-gray-300 transition-all shadow-sm"
              >
                <Camera size={22} className="text-gray-600" />
                <span className="text-xs font-semibold">Save Image</span>
              </button>
              
              <button 
                onClick={toggleRecording}
                className={`flex flex-col items-center justify-center gap-2 py-4 px-4 rounded-xl transition-all shadow-sm border ${
                  isRecording 
                    ? 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100' 
                    : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100 hover:border-gray-300'
                }`}
              >
                {isRecording ? (
                  <Square size={22} className="fill-current animate-pulse" />
                ) : (
                  <Video size={22} className="text-gray-600" />
                )}
                <span className="text-xs font-semibold">
                  {isRecording ? 'Stop Recording' : 'Record Video'}
                </span>
              </button>
            </div>
          </div>
          
        </div>
      </div>

      {/* --- Main Canvas Area --- */}
      <div className="flex-1 relative h-full w-full">
        
        {/* Floating Open Button (visible when panel is closed) */}
        {!isPanelOpen && (
          <button 
            onClick={() => setIsPanelOpen(true)}
            className="absolute top-6 left-6 z-20 p-3 bg-white/90 backdrop-blur-md shadow-lg border border-gray-200 rounded-full text-gray-700 hover:bg-white hover:scale-105 transition-all"
            title="Open Controls"
          >
            <PanelLeftOpen size={24} />
          </button>
        )}
        
        <Canvas 
          camera={{ position: [0, 0, 8], fov: 50 }} 
          dpr={[1, 2]}
          gl={{ preserveDrawingBuffer: true }}
        >
          <color attach="background" args={[bgColor]} />
          {useLighting && (
            <>
              <ambientLight intensity={0.6} />
              <directionalLight position={[10, 10, 5]} intensity={1.5} />
              <directionalLight position={[-10, -10, -5]} intensity={0.8} color={lineColor} />
            </>
          )}
          <CaptureManager captureRef={captureRef} />
          <ParametricShape isPlaying={isPlaying} speed={speed} lineColor={lineColor} shapeId={shapeId} useLighting={useLighting} />
          <OrbitControls 
            enableZoom={true} 
            enablePan={false} 
            enableRotate={true} 
            autoRotate={isPlaying} 
            autoRotateSpeed={0.5 * speed} 
          />
        </Canvas>
        
        {/* Overlay Text */}
        <div className="absolute bottom-8 right-8 pointer-events-none text-right transition-colors duration-300">
          <h1 
            className="text-xl font-light tracking-widest mb-1 uppercase" 
            style={{ color: textColor }}
          >
            {currentMeta.name}
          </h1>
          <p 
            className="text-xs tracking-wider font-mono opacity-60" 
            style={{ color: textColor }}
          >
            {currentMeta.formula}
          </p>
        </div>
        
      </div>
    </div>
  );
}
