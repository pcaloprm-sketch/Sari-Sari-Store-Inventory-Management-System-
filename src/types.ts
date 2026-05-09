export interface Product {
  id: string;
  name: string;
  price: number;
  quantity: number;
  category: string;
  image?: string;
}

export interface SaleItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

export interface Sale {
  id: string;
  items: SaleItem[];
  total: number;
  timestamp: number;
}

export interface ThemeConfig {
  backgroundColor: string;
  accentColor: string;
  cardOpacity: number;
}

export interface AppState {
  inventory: Product[];
  sales: Sale[];
  theme: ThemeConfig;
}
