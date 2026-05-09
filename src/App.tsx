/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, ReactNode, useRef, ChangeEvent } from 'react';
import { 
  Store, 
  Package, 
  ShoppingCart, 
  Settings, 
  Plus, 
  Minus, 
  Trash2, 
  ChevronRight, 
  LayoutDashboard,
  Clock,
  Palette,
  LogOut,
  Search,
  AlertTriangle,
  Camera,
  Sparkles,
  RefreshCw,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { Product, Sale, ThemeConfig, SaleItem } from './types';

// Initial Data
const INITIAL_INVENTORY: Product[] = [
  { id: '1', name: 'Lucky Me Pancit Canton', price: 15, quantity: 24, category: 'Noodles' },
  { id: '2', name: 'Piattos Large', price: 38, quantity: 12, category: 'Snacks' },
  { id: '3', name: 'Coca-Cola 290ml', price: 20, quantity: 30, category: 'Beverages' },
  { id: '4', name: 'Bear Brand sachet', price: 18, quantity: 50, category: 'Dairy' },
  { id: '5', name: 'Nescafe 3-in-1', price: 12, quantity: 100, category: 'Coffee' },
];

const DEFAULT_THEME: ThemeConfig = {
  backgroundColor: '#f3f4f6',
  accentColor: '#feebc8',
  cardOpacity: 0.95
};

export default function App() {
  // State Initialization
  const [inventory, setInventory] = useState<Product[]>(() => {
    const saved = localStorage.getItem('sari_sari_inventory');
    return saved ? JSON.parse(saved) : INITIAL_INVENTORY;
  });

  const [sales, setSales] = useState<Sale[]>(() => {
    const saved = localStorage.getItem('sari_sari_sales');
    return saved ? JSON.parse(saved) : [];
  });

  const [theme, setTheme] = useState<ThemeConfig>(() => {
    const saved = localStorage.getItem('sari_sari_theme');
    return saved ? JSON.parse(saved) : DEFAULT_THEME;
  });

  const [activeTab, setActiveTab] = useState('inventory');
  const [language, setLanguage] = useState<'en' | 'tl'>('en');
  const [cart, setCart] = useState<{ [productId: string]: number }>({});
  
  const t = (key: string) => {
    const dict: any = {
      en: {
        inventory: 'Inventory',
        salesHistory: 'History Transaction',
        scanProduct: 'SCAN YOUR PRODUCT',
        criticalStock: 'Critical Stock Alerts',
        stats: 'Stats',
        pos: 'POS',
        stock: 'Stock',
        orders: 'Orders',
        style: 'Style',
        scanDesc: 'Automatic scan and sell. Identified products are instantly deducted from stock!',
        restock: 'Restock Alert!',
        searchPlaceholder: 'search item for manual add',
        openScanner: 'Open your camera to scan the product',
        currentTransaction: 'Current transaction',
      },
      tl: {
        inventory: 'IMBENTORY',
        salesHistory: 'Kasaysayan ng Transaksyon',
        scanProduct: 'I-SCAN ANG PRODUKTO',
        criticalStock: 'Mga Produkto na Paubos na',
        stats: 'Stats',
        pos: 'POS',
        stock: 'Imbak',
        orders: 'Mga order',
        style: 'Estilo',
        scanDesc: 'Awtomatikong i-scan at ibenta. Ang mga natukoy na produkto ay agad na ibinabawas sa stock!',
        restock: 'Paalala sa Stock!',
        searchPlaceholder: 'paghahanap ng produkto at Mano manong pag add ng produkto',
        openScanner: 'Buksan ang camera para masuri ang Produkto',
        currentTransaction: 'Kasalukuyang Transaksyon',
      }
    };
    return dict[language][key] || key;
  };
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [isFlashlightOn, setIsFlashlightOn] = useState(false);
  
  // AI Scanner State
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'analyzing' | 'done' | 'error'>('idle');
  const [scanResult, setScanResult] = useState<{ productId?: string; message: string; name: string; price: number } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Notifications
  const lowStockItems = useMemo(() => {
    return inventory.filter(p => p.quantity <= 10);
  }, [inventory]);

  const [showNotifications, setShowNotifications] = useState(false);
  
  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditingProduct(prev => prev ? { ...prev, image: reader.result as string } : null);
      };
      reader.readAsDataURL(file);
    }
  };

  const saveProduct = () => {
    if (!editingProduct?.name || !editingProduct?.price || !editingProduct?.category) return;

    if (editingProduct.id) {
      updateProduct(editingProduct as Product);
    } else {
      addProduct(editingProduct as Omit<Product, 'id'>);
    }
    setIsModalOpen(false);
    setEditingProduct(null);
  };

  // Persistence
  useEffect(() => {
    localStorage.setItem('sari_sari_inventory', JSON.stringify(inventory));
  }, [inventory]);

  useEffect(() => {
    localStorage.setItem('sari_sari_sales', JSON.stringify(sales));
  }, [sales]);

  useEffect(() => {
    localStorage.setItem('sari_sari_theme', JSON.stringify(theme));
  }, [theme]);

  useEffect(() => {
    // Reset tab manually if needed, default is inventory for admin
    setActiveTab('inventory');
  }, []);

  // AI Scanning Logic
  const startScanner = async () => {
    setIsScanning(true);
    setScanStatus('scanning');
    setScanResult(null);
    setIsFlashlightOn(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          setTimeout(analyzeProduct, 1000); // Trigger auto-scan after 1s
        };
      }
    } catch (err) {
      console.error("Camera error:", err);
      setScanStatus('error');
    }
  };

  const toggleFlashlight = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;
    
    // @ts-ignore
    const capabilities = track.getCapabilities ? track.getCapabilities() : {};
    // @ts-ignore
    if (capabilities.torch) {
      await track.applyConstraints({
         // @ts-ignore
         advanced: [{ torch: !isFlashlightOn }]
      });
      setIsFlashlightOn(!isFlashlightOn);
    }
  };

  const stopScanner = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsScanning(false);
    setScanStatus('idle');
    setIsFlashlightOn(false);
  };

  const analyzeProduct = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    setScanStatus('analyzing');

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const base64Image = canvas.toDataURL('image/jpeg').split(',')[1];

    try {
      const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `You are a high-speed, expert OCR assistant for a sari-sari store.
      Given the image, instantly identify the product name, ignoring font style, size, or any decorative elements.
      Focus entirely on extracting the primary product/brand name.
      Return ONLY this valid JSON: { "productName": "string" }.
      Do not include any conversational text, explanations, or Markdown formatting.`;

      const response = await genAI.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              { text: prompt },
              { inlineData: { mimeType: "image/jpeg", data: base64Image } }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json"
        }
      });

      const result = JSON.parse(response.text || '{}');
      
      // Find product in inventory if possible
      const matchedProduct = inventory.find(p => 
        p.name.toLowerCase().includes(result.productName.toLowerCase()) ||
        result.productName.toLowerCase().includes(p.name.toLowerCase())
      );

      if (matchedProduct) {
        if (matchedProduct.quantity > 0) {
          // Automatic Deduction & Transaction Recording
          const saleItem: SaleItem = {
            productId: matchedProduct.id,
            name: matchedProduct.name,
            price: matchedProduct.price,
            quantity: 1
          };

          const newSale: Sale = {
            id: Math.random().toString(36).substring(2, 11),
            items: [saleItem],
            total: matchedProduct.price,
            timestamp: Date.now()
          };

          setSales(prev => [newSale, ...prev]);
          setInventory(prev => prev.map(p => 
            p.id === matchedProduct.id 
              ? { ...p, quantity: p.quantity - 1 } 
              : p
          ));

          setScanResult({
            productId: matchedProduct.id,
            name: matchedProduct.name,
            price: matchedProduct.price,
            message: `Identified: ${matchedProduct.name}. 1 unit deducted from stock and recorded in sales.`
          });
        } else {
          setScanResult({
            productId: matchedProduct.id,
            name: matchedProduct.name,
            price: matchedProduct.price,
            message: `Identified: ${matchedProduct.name}, but it is OUT OF STOCK!`
          });
        }
      } else {
        setScanResult({
          name: result.productName,
          price: 0,
          message: `Identified as "${result.productName}" but this item is not in your inventory.`
        });
      }

      setScanStatus('done');

    } catch (err) {
      console.error("AI Error:", err);
      setScanStatus('error');
    }
  };

  // Derived Values
  const filteredInventory = inventory.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const cartTotal = useMemo(() => {
    return Object.entries(cart).reduce((total: number, [id, qty]: [string, number]) => {
      const product = inventory.find(p => p.id === id);
      return total + (product ? product.price * qty : 0);
    }, 0);
  }, [cart, inventory]);

  // Analytics
  const analytics = useMemo(() => {
    return {};
  }, [sales]);

  const StatCard = ({ label, value, color, trend }: { label: string, value: string | number, color: 'orange' | 'blue' | 'green' | 'purple', trend?: string }) => (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -5 }}
      className={`bg-white rounded-3xl p-6 shadow-sm border border-black/5 ${trend ? 'col-span-1' : ''}`}
    >
      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">{label}</p>
      <h3 className="text-3xl font-black text-gray-900 tracking-tighter mb-2">{value}</h3>
      {trend && (
        <span className={`text-xs font-black ${parseFloat(trend) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
          {parseFloat(trend) >= 0 ? '+' : ''}{trend}% vs previous
        </span>
      )}
    </motion.div>
  );
  const addToCart = (productId: string) => {
    const product = inventory.find(p => p.id === productId);
    if (!product || product.quantity <= (cart[productId] || 0)) return;
    
    setCart(prev => ({
      ...prev,
      [productId]: (prev[productId] || 0) + 1
    }));
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => {
      const newCart = { ...prev };
      if (newCart[productId] > 1) {
        newCart[productId] -= 1;
      } else {
        delete newCart[productId];
      }
      return newCart;
    });
  };

  const checkout = () => {
    if (Object.keys(cart).length === 0) return;

    const saleItems: SaleItem[] = Object.entries(cart).map(([id, qty]: [string, number]) => {
      const product = inventory.find(p => p.id === id)!;

      return {
        productId: id,
        name: product.name,
        price: product.price,
        quantity: qty
      };
    });

    const newSale: Sale = {
      id: Math.random().toString(36).substring(2, 11),
      items: saleItems,
      total: cartTotal,
      timestamp: Date.now()
    };

    setSales(prev => [newSale, ...prev]);
    
    // Update Inventory
    setInventory(prev => prev.map(p => {
      if (cart[p.id]) {
        return { ...p, quantity: p.quantity - cart[p.id] };
      }
      return p;
    }));

    setCart({});
    alert('Thank you for your purchase!');
  };

  const updateProduct = (updatedProduct: Product) => {
    setInventory(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
  };

  const addProduct = (product: Omit<Product, 'id'>) => {
    const newProduct: Product = {
      ...product,
      id: Math.random().toString(36).substring(2, 11)
    };
    setInventory(prev => [...prev, newProduct]);
  };

  const deleteProduct = (id: string) => {
    setInventory(prev => prev.filter(p => p.id !== id));
  };

  // Helper formatting
  const formatCurrency = (val: number) => `₱${val.toFixed(2)}`;

  return (
    <div 
      className="min-h-screen transition-colors duration-500 font-sans"
      style={{ backgroundColor: theme.backgroundColor }}
    >
      {/* Main Container */}
      <div className="max-w-6xl mx-auto px-4 py-8 md:py-12">
        {/* Header */}
        <header className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center shadow-sm border border-black/5 rotate-3 relative">
              <Store size={32} className="text-orange-600" />
              {lowStockItems.length > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 border-2 border-white rounded-full flex items-center justify-center text-[10px] text-white font-bold animate-pulse">
                  {lowStockItems.length}
                </span>
              )}
            </div>
            <div>
              <h1 className="text-4xl font-black tracking-tight text-gray-900 uppercase italic leading-none">
                Sari-Sari <br />
                <span className="text-orange-600">{t('inventory')}</span>
              </h1>
              <div className="flex gap-2 mt-2">
                <button onClick={() => setLanguage('en')} className={`px-2 py-0.5 rounded text-[10px] font-black ${language === 'en' ? 'bg-orange-600 text-white' : 'bg-white text-gray-400'}`}>EN</button>
                <button onClick={() => setLanguage('tl')} className={`px-2 py-0.5 rounded text-[10px] font-black ${language === 'tl' ? 'bg-orange-600 text-white' : 'bg-white text-gray-400'}`}>TL</button>
              </div>
            </div>
          </div>

          {/* Restock Notification Banner */}
          {lowStockItems.length > 0 && (
            <motion.div 
               initial={{ opacity: 0, x: 20 }}
               animate={{ opacity: 1, x: 0 }}
               className="flex-grow max-w-md bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center gap-4 cursor-pointer hover:bg-red-100 transition-colors"
               onClick={() => setActiveTab('inventory')}
            >
               <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center text-white shrink-0">
                  <AlertTriangle size={20} />
               </div>
               <div className="flex-grow">
                  <p className="text-xs font-black text-red-600 uppercase tracking-widest leading-none mb-1">{t('restock')}</p>
                  <p className="text-sm font-bold text-gray-900 leading-none">
                    {lowStockItems.length} items are below 10 qty.
                  </p>
               </div>
               <ChevronRight size={20} className="text-red-400" />
            </motion.div>
          )}

          {/* Navigation */}
          <nav className="flex gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
            <NavButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutDashboard size={18} />} label={t('stats')} />
            <NavButton active={activeTab === 'pos'} onClick={() => setActiveTab('pos')} icon={<ShoppingCart size={18} />} label={t('pos')} />
            <NavButton active={activeTab === 'inventory'} onClick={() => setActiveTab('inventory')} icon={<Package size={18} />} label={t('stock')} />
            <NavButton active={activeTab === 'sales'} onClick={() => setActiveTab('sales')} icon={<Clock size={18} />} label={t('orders')} />
            <NavButton active={activeTab === 'theme'} onClick={() => setActiveTab('theme')} icon={<Palette size={18} />} label={t('style')} />
          </nav>
        </header>

        <main>
          <AnimatePresence mode="wait">
            {/* --- POS VIEW (Point of Sale) --- */}
            {activeTab === 'pos' && (
              <motion.div 
                key="pos"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="grid grid-cols-1 lg:grid-cols-3 gap-8"
              >
                <div className="lg:col-span-2 space-y-6">
                  {/* AI Scanner Trigger */}
                  <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-3xl p-6 text-white shadow-xl flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden relative group">
                    <div className="relative z-10">
                      <h3 className="text-2xl font-black italic uppercase leading-tight mb-2">{t('scanProduct')}</h3>
                      <p className="text-orange-100 text-sm font-medium">{t('scanDesc')}</p>
                    </div>
                    <button 
                      onClick={startScanner}
                      className="relative z-10 flex items-center gap-3 bg-white text-orange-600 px-8 py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-2xl hover:scale-105 transition-transform"
                    >
                      <Camera size={20} />
                      {t('openScanner')}
                    </button>
                    <Sparkles className="absolute -right-8 -bottom-8 text-white/10 w-48 h-48 group-hover:scale-125 group-hover:rotate-12 transition-transform duration-700" />
                  </div>

                  {/* Search Bar */}
                  <div className="relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input 
                      type="text" 
                      placeholder={t('searchPlaceholder')}
                      className="w-full pl-12 pr-4 py-4 bg-white border border-black/5 rounded-2xl shadow-sm outline-none font-medium"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>

                  {/* Product Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {filteredInventory.map(product => (
                      <div 
                        key={product.id}
                        onClick={() => addToCart(product.id)}
                        className={`bg-white rounded-2xl p-4 shadow-sm border border-black/5 hover:border-orange-200 cursor-pointer transition-all flex flex-col ${product.quantity === 0 ? 'opacity-40 grayscale pointer-events-none' : ''}`}
                      >
                         <div className="w-full aspect-square bg-gray-50 rounded-xl mb-3 flex items-center justify-center p-2 overflow-hidden relative">
                           {product.image ? (
                             <img src={product.image} className="w-full h-full object-cover" />
                           ) : (
                             <Package className="text-gray-200" size={32} />
                           )}
                           {product.quantity <= 10 && (
                             <div className="absolute top-2 right-2 w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-sm" />
                           )}
                         </div>
                         <h4 className="font-bold text-gray-900 text-sm leading-tight truncate">{product.name}</h4>
                         <div className="flex justify-between items-center mt-2">
                            <span className="font-black text-lg">{formatCurrency(product.price)}</span>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{product.quantity} in stock</span>
                         </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Cart / Checkout */}
                <div className="lg:col-span-1">
                   <div className="bg-white rounded-3xl p-6 shadow-xl border border-black/5 sticky top-8">
                     <h2 className="text-xl font-black italic uppercase mb-6 flex items-center gap-3">
                       {t('currentTransaction')}
                       <span className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-lg not-italic font-black">
                         {Object.values(cart).reduce((a: number, b: number) => a + b, 0)}
                       </span>
                     </h2>

                     <div className="space-y-3 mb-8 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
                        {Object.keys(cart).length === 0 ? (
                          <div className="py-12 text-center text-gray-400 italic font-medium">{language === 'tl' ? 'Simulan mamili ng Produkto' : 'Select item to start'}</div>
                        ) : (
                          Object.entries(cart).map(([id, qty]: [string, number]) => {
                            const product = inventory.find(p => p.id === id)!;
                            return (
                              <div key={id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50">
                                 <div className="flex-grow">
                                    <h4 className="font-black text-sm text-gray-900">{product.name}</h4>
                                    <p className="text-[10px] uppercase font-bold text-gray-400">
                                      {formatCurrency(product.price)}
                                    </p>
                                 </div>
                                 <div className="flex items-center gap-3 px-2">
                                    <button onClick={(e) => { e.stopPropagation(); removeFromCart(id); }} className="hover:text-red-500"><Minus size={14} /></button>
                                    <span className="text-sm font-black w-4 text-center">{qty}</span>
                                    <button onClick={(e) => { e.stopPropagation(); addToCart(id); }} className="hover:text-orange-500"><Plus size={14} /></button>
                                 </div>
                              </div>
                            );
                          })
                        )}
                     </div>

                     <div className="pt-6 border-t border-gray-100 space-y-4">
                        <div className="flex justify-between items-end">
                           <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">{language === 'tl' ? 'Kabuang Nakuhang Halaga' : 'Total Amount'}</span>
                           <span className="text-3xl font-black tracking-tighter">{formatCurrency(cartTotal)}</span>
                        </div>
                        <button 
                          disabled={Object.keys(cart).length === 0}
                          onClick={checkout}
                          className="w-full bg-orange-600 text-white font-black py-4 rounded-2xl shadow-xl shadow-orange-600/20 hover:bg-gray-900 transition-all disabled:opacity-30 uppercase tracking-widest text-sm"
                        >
                          {language === 'tl' ? 'Kompletuhin ang Nakuhang Produkto' : 'Complete Order'}
                        </button>
                     </div>
                   </div>
                </div>
              </motion.div>
            )}

            {/* --- DASHBOARD VIEW --- */}
            {activeTab === 'dashboard' && (
              <motion.div 
                key="admin-dashboard"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                </div>
                <div className="bg-white rounded-3xl p-8 border border-black/5 shadow-sm">
                  <h3 className="text-xl font-black mb-6 flex items-center gap-2 italic">
                    <AlertTriangle className="text-red-500" />
                    Critical Stock Alerts
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-gray-100 italic text-[11px] uppercase tracking-widest text-gray-400">
                          <th className="pb-4 font-normal">Item</th>
                          <th className="pb-4 font-normal">Remaining</th>
                          <th className="pb-4 font-normal">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {inventory.filter(item => item.quantity <= 20).sort((a, b) => a.quantity - b.quantity).map(item => (
                          <tr key={item.id} className="group">
                            <td className="py-4">
                              <div className="font-bold text-gray-900">{item.name}</div>
                              <div className="text-xs text-gray-400 uppercase tracking-wider">{item.category}</div>
                            </td>
                            <td className="py-4">
                              <span className={`text-lg font-black ${item.quantity < 5 ? 'text-red-500' : 'text-gray-900'}`}>
                                {item.quantity}
                              </span>
                            </td>
                            <td className="py-4">
                              <button onClick={() => { setActiveTab('inventory'); }} className="text-sm font-bold text-blue-600 hover:underline">Restock</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {/* --- INVENTORY VIEW --- */}
            {activeTab === 'inventory' && (
              <motion.div 
                key="admin-inventory"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="bg-white rounded-3xl p-8 border border-black/5 shadow-sm"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
                  <h2 className="text-3xl font-black italic uppercase tracking-tighter">Inventory Control</h2>
                  <button 
                    onClick={() => {
                      setEditingProduct({ name: '', price: 0, quantity: 0, category: 'General' });
                      setIsModalOpen(true);
                    }}
                    className="flex items-center gap-2 bg-gray-900 text-white px-6 py-3 rounded-2xl font-black text-sm uppercase tracking-widest transition-all hover:bg-orange-600 hover:-translate-y-1"
                  >
                    <Plus size={20} />
                    Add New Product
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {inventory.map(item => (
                    <div key={item.id} className="p-6 rounded-2xl bg-gray-50 border border-transparent hover:border-orange-200 transition-all flex flex-col group">
                      <div className="flex justify-between items-start mb-4">
                         <div className="flex gap-4">
                            <div className="w-12 h-12 bg-white rounded-lg border flex items-center justify-center overflow-hidden shrink-0">
                              {item.image ? (
                                <img src={item.image} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              ) : (
                                <Package size={20} className="text-gray-300" />
                              ) }
                            </div>
                            <div>
                               <span className="text-[10px] font-black text-orange-600 uppercase tracking-widest">{item.category}</span>
                               <h4 className="text-lg font-black text-gray-900 leading-tight">{item.name}</h4>
                            </div>
                         </div>
                         <div className="flex gap-2">
                            <button onClick={() => { setEditingProduct(item); setIsModalOpen(true); }} className="text-gray-300 hover:text-blue-500 transition-colors p-1"><Settings size={16} /></button>
                            <button onClick={() => deleteProduct(item.id)} className="text-gray-300 hover:text-red-500 transition-colors p-1"><Trash2 size={16} /></button>
                         </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 mt-8">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Price</label>
                          <div className="flex items-center gap-2">
                             <span className="font-black text-xl">{formatCurrency(item.price)}</span>
                             <div className="flex gap-1">
                                <button onClick={() => updateProduct({...item, price: Math.max(0, item.price - 1)})} className="p-1 hover:bg-white rounded-md"><Minus size={14} /></button>
                                <button onClick={() => updateProduct({...item, price: item.price + 1})} className="p-1 hover:bg-white rounded-md"><Plus size={14} /></button>
                             </div>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Stock Qty</label>
                          <div className="flex items-center gap-3">
                             <span className={`font-black text-xl ${item.quantity < 5 ? 'text-red-500' : 'text-gray-900'}`}>{item.quantity}</span>
                             <div className="flex gap-1">
                                <button onClick={() => updateProduct({...item, quantity: Math.max(0, item.quantity - 1)})} className="p-1 hover:bg-white rounded-md"><Minus size={14} /></button>
                                <button onClick={() => updateProduct({...item, quantity: item.quantity + 1})} className="p-1 hover:bg-white rounded-md"><Plus size={14} /></button>
                             </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* --- SALES VIEW --- */}
            {activeTab === 'sales' && (
              <motion.div 
                key="admin-sales"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="bg-white rounded-3xl p-8 border border-black/5 shadow-sm"
              >
                <h2 className="text-3xl font-black italic uppercase tracking-tighter mb-8">History Transaction</h2>
                <div className="space-y-4">
                  {sales.length === 0 ? (
                    <div className="text-center py-20 text-gray-400">No transactions yet recorded.</div>
                  ) : (
                    sales.map(sale => (
                      <div key={sale.id} className="p-6 rounded-2xl bg-gray-50 border border-black/5 flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="flex items-center gap-6">
                          <div className="p-4 bg-white rounded-xl shadow-sm">
                            <Clock size={20} className="text-gray-400" />
                          </div>
                          <div>
                            <p className="text-xs text-gray-400 uppercase font-black">{new Date(sale.timestamp).toLocaleString()}</p>
                            <h4 className="text-lg font-black text-gray-900">{sale.items.length} items sold</h4>
                            <div className="flex flex-wrap gap-2 mt-1">
                               {sale.items.map((it, i) => (
                                 <span key={i} className="text-[10px] bg-white px-2 py-0.5 rounded border text-gray-600 font-medium">{it.name} x{it.quantity}</span>
                               ))}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-400 uppercase font-black mb-1">Total Amount</p>
                          <span className="text-2xl font-black text-gray-900">{formatCurrency(sale.total)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}

            {/* --- THEME VIEW --- */}
            {activeTab === 'theme' && (
              <motion.div 
                key="admin-theme"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-white rounded-3xl p-10 border border-black/5 shadow-sm max-w-2xl mx-auto"
              >
                <h2 className="text-3xl font-black italic uppercase tracking-tighter mb-12 text-center">Appearance Settings</h2>
                
                <div className="space-y-12">
                  <div className="space-y-4">
                    <label className="text-sm font-black uppercase tracking-widest text-gray-400 block text-center">Store Background Color</label>
                    <div className="grid grid-cols-5 gap-3">
                      {['#f3f4f6', '#feebc8', '#e9d8fd', '#fecaca', '#d1fae5', '#3b82f6', '#111827', '#ffffff', '#22c55e', '#ec4899'].map(color => (
                        <button 
                          key={color}
                          onClick={() => setTheme({ ...theme, backgroundColor: color })}
                          className={`aspect-square rounded-2xl shadow-inner transition-all transform hover:scale-110 ${theme.backgroundColor === color ? 'ring-4 ring-orange-500 ring-offset-4 ring-offset-white' : ''}`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="pt-8 border-t flex items-center justify-between">
                    <div>
                      <h4 className="font-black text-gray-900 italic">Reset to Default</h4>
                      <p className="text-sm text-gray-400 font-medium">Clear all custom styling settings</p>
                    </div>
                    <button 
                      onClick={() => setTheme(DEFAULT_THEME)}
                      className="p-4 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
                    >
                      <LogOut size={20} />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* AI Scanner View (Overlays Everything when active) */}
      <AnimatePresence>
        {isScanning && (
          <div className="fixed inset-0 z-[110] flex flex-col bg-gray-900">
             {/* Header */}
             <div className="p-6 flex items-center justify-between z-20">
                <div>
                   <h2 className="text-xl font-black text-white italic uppercase tracking-tight flex items-center gap-2">
                     <Camera className="text-orange-500" />
                     Live AI Identifier
                   </h2>
                </div>
                <button onClick={toggleFlashlight} className={`text-white p-3 rounded-2xl hover:bg-white/20 transition-all backdrop-blur-md italic font-black text-xs uppercase tracking-widest flex items-center gap-2 ${isFlashlightOn ? 'bg-orange-500' : 'bg-white/10'}`}>
                   {isFlashlightOn ? 'Flash Off' : 'Flash On'}
                </button>
                <button onClick={stopScanner} className="text-white bg-white/10 p-3 rounded-2xl hover:bg-white/20 transition-all backdrop-blur-md italic font-black text-xs uppercase tracking-widest flex items-center gap-2">
                  <X size={18} /> Close
                </button>
             </div>

             {/* Camera Viewport */}
             <div className="flex-grow flex items-center justify-center relative overflow-hidden">
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  className="w-full h-full object-cover md:rounded-3xl max-w-4xl max-h-[70vh] shadow-2xl"
                />
                
                {/* Target Overlay */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                   <div className="w-64 h-64 border-2 border-dashed border-white/50 rounded-3xl relative">
                      <div className="absolute -top-1 -left-1 w-6 h-6 border-l-4 border-t-4 border-orange-500 rounded-tl-lg" />
                      <div className="absolute -top-1 -right-1 w-6 h-6 border-r-4 border-t-4 border-orange-500 rounded-tr-lg" />
                      <div className="absolute -bottom-1 -left-1 w-6 h-6 border-l-4 border-b-4 border-orange-500 rounded-bl-lg" />
                      <div className="absolute -bottom-1 -right-1 w-6 h-6 border-r-4 border-b-4 border-orange-500 rounded-br-lg" />
                      
                      {scanStatus === 'scanning' && (
                         <motion.div 
                           animate={{ y: [0, 256, 0] }}
                           transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                           className="absolute inset-x-0 h-1 bg-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.8)] opacity-60"
                         />
                      )}
                   </div>
                </div>
                
                <canvas ref={canvasRef} className="hidden" />
             </div>

             {/* UI Controls */}
             <div className="p-8 bg-black/40 backdrop-blur-3xl border-t border-white/10 relative z-20">
                <div className="max-w-2xl mx-auto flex flex-col items-center">
                   
                     <div className="flex flex-grow items-center justify-center">
                       {scanStatus === 'analyzing' ? (
                         <div className="flex flex-col items-center gap-4 py-8">
                           <RefreshCw className="text-orange-500 animate-spin" size={48} />
                           <p className="text-white font-black uppercase tracking-widest text-sm italic">Gemini identifying product...</p>
                         </div>
                       ) : scanStatus === 'done' && scanResult ? (
                         <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`rounded-3xl p-6 w-full border mb-8 transition-all duration-500 ${scanResult.productId ? 'bg-green-500/5 border-green-500/50 shadow-[0_0_30px_rgba(34,197,94,0.2)]' : 'bg-white/10 border-white/10'}`}
                         >
                           <div className="flex items-center gap-4 mb-4">
                              <div className={`w-12 h-12 ${scanResult.productId ? 'bg-green-500' : 'bg-red-500'} rounded-2xl flex items-center justify-center text-white`}>
                                 {scanResult.productId ? <ShoppingCart size={24} /> : <AlertTriangle size={24} />}
                              </div>
                              <div>
                                 <h4 className={`${scanResult.productId ? 'text-green-500' : 'text-red-500'} font-black uppercase tracking-widest text-xs italic`}>
                                   {scanResult.productId ? 'Sold & Stock Updated' : 'Item Not Found'}
                                 </h4>
                                 <p className="text-white font-bold">{scanResult.message}</p>
                              </div>
                           </div>
                           
                           {scanResult.productId && (
                             <div className="p-4 bg-green-500/20 border border-green-500/50 rounded-2xl flex justify-between items-center">
                                <span className="text-white font-black uppercase tracking-widest text-xs">Total: {formatCurrency(scanResult.price)}</span>
                                <span className="bg-green-500 text-white text-[10px] font-black px-2 py-1 rounded-lg uppercase">Recorded</span>
                             </div>
                           )}
                           
                           <div className="mt-6 flex gap-3">
                               <button onClick={startScanner} className="flex-grow bg-white/10 hover:bg-white/20 text-white font-black px-6 py-4 rounded-2xl transition-all uppercase tracking-widest text-xs">Scan Next</button>
                              
                              <button 
                                onClick={() => { stopScanner(); setActiveTab('sales'); }}
                                className="flex-[2] bg-white text-gray-900 font-black px-8 py-4 rounded-2xl transition-all shadow-xl uppercase tracking-widest text-xs"
                              >
                                View History
                              </button>
                           </div>
                         </motion.div>
                       ) : (
                         <button 
                           onClick={analyzeProduct}
                           className="bg-white text-gray-900 w-24 h-24 rounded-full flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition-all mb-4 border-8 border-white/20 group"
                         >
                            <div className="w-12 h-12 bg-gray-900 rounded-full group-hover:scale-110 transition-transform" />
                         </button>
                       )}
                     </div>
                   
                   <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest italic bg-white/5 px-4 py-2 rounded-full">
                     Center the item label in the box for best AI accuracy
                   </p>
                </div>
             </div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal for Add/Edit Product */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-lg rounded-3xl p-8 shadow-2xl relative z-10 overflow-hidden"
            >
              <div className="mb-8">
                <h3 className="text-2xl font-black italic uppercase tracking-tight">
                  {editingProduct?.id ? 'Edit Product' : 'Add New Item'}
                </h3>
                <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mt-1">Sari-Sari Inventory</p>
              </div>

              <div className="space-y-6">
                {/* Photo Upload Area */}
                <div className="flex gap-4 items-center">
                  <div className="w-24 h-24 bg-gray-100 rounded-2xl border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden shrink-0 relative group">
                    {editingProduct?.image ? (
                      <img src={editingProduct.image} className="w-full h-full object-cover" />
                    ) : (
                      <Palette className="text-gray-300" size={32} />
                    )}
                    <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer">
                      <Plus className="text-white" size={24} />
                      <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                    </label>
                  </div>
                  <div className="flex-grow space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Product Photo</label>
                    <input 
                      type="text" 
                      placeholder="Or paste an image URL..."
                      className="w-full bg-gray-50 border-0 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-orange-200"
                      value={editingProduct?.image || ''}
                      onChange={(e) => setEditingProduct(prev => prev ? { ...prev, image: e.target.value } : null)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 col-span-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Name</label>
                    <input 
                      type="text" 
                      className="w-full bg-gray-50 border-0 rounded-xl px-4 py-3 text-lg font-bold outline-none focus:ring-2 focus:ring-orange-200"
                      value={editingProduct?.name || ''}
                      onChange={(e) => setEditingProduct(prev => prev ? { ...prev, name: e.target.value } : null)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Price (₱)</label>
                    <input 
                      type="number"
                      className="w-full bg-gray-50 border-0 rounded-xl px-4 py-3 text-lg font-bold outline-none focus:ring-2 focus:ring-orange-200"
                      value={editingProduct?.price || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditingProduct(prev => prev ? { ...prev, price: val === '' ? 0 : Number(val) } : null);
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Quantity</label>
                    <input 
                      type="number"
                      className="w-full bg-gray-50 border-0 rounded-xl px-4 py-3 text-lg font-bold outline-none focus:ring-2 focus:ring-orange-200"
                      value={editingProduct?.quantity === 0 ? '' : editingProduct?.quantity}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditingProduct(prev => prev ? { ...prev, quantity: val === '' ? 0 : Number(val) } : null);
                      }}
                    />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Category</label>
                    <input 
                      type="text" 
                      className="w-full bg-gray-50 border-0 rounded-xl px-4 py-3 text-lg font-bold outline-none focus:ring-2 focus:ring-orange-200"
                      value={editingProduct?.category || ''}
                      onChange={(e) => setEditingProduct(prev => prev ? { ...prev, category: e.target.value } : null)}
                    />
                  </div>
                </div>

                <div className="pt-6 flex gap-3">
                  <button 
                    onClick={() => setIsModalOpen(false)}
                    className="flex-grow py-4 rounded-2xl bg-gray-100 font-bold uppercase tracking-widest text-sm hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={saveProduct}
                    className="flex-[2] py-4 rounded-2xl bg-orange-600 text-white font-black uppercase tracking-widest text-sm hover:bg-gray-900 transition-all shadow-lg shadow-orange-600/20"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer / Copyright */}
      <footer className="mt-20 py-12 px-4 border-t border-black/5 text-center">
        <p className="text-gray-400 text-xs font-black uppercase tracking-[0.2em] italic">
          Sari-Sari Inventory &copy; 2026 • Local Convenience Shop
        </p>
      </footer>
    </div>
  );
}

// Sub-components
function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-2 px-6 py-3 rounded-2xl transition-all font-black text-sm uppercase tracking-widest whitespace-nowrap ${
        active 
          ? 'bg-gray-900 text-white shadow-xl shadow-gray-900/20 translate-y-[-2px]' 
          : 'text-gray-400 hover:text-gray-900 hover:bg-white w-full'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
