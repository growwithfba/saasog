import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { supabase } from '@/utils/supabaseClient';

interface ProductFunnelStats {
  productsInFunnel: number;
  productsVetted: number;
  productsOffered: number;
  productsSourced: number;
  products: any[] | null;
  loading: boolean;
  error: string | null;
  setUpdateProducts: (update: boolean) => void;
}

export const useProductFunnelStats = (): ProductFunnelStats => {
  const { user } = useSelector((state: RootState) => state.auth);
  
  const [productsInFunnel, setProductsInFunnel] = useState<number>(0);
  const [productsVetted, setProductsVetted] = useState<number>(0);
  const [productsOffered, setProductsOffered] = useState<number>(0);
  const [productsSourced, setProductsSourced] = useState<number>(0);
  const [products, setProducts] = useState<any[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [updateProducts, setUpdateProducts] = useState<boolean>(false);

  const fetchStats = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Get session for authorization
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setError('No session found');
        setLoading(false);
        return;
      }

      // Ejecutar todas las consultas en paralelo para mejor rendimiento
      const [
        { count: inFunnelCount, error: inFunnelError },
        { count: vettedCount, error: vettedError },
        { count: offeredCount, error: offeredError },
        { count: sourcedCount, error: sourcedError },
        { data: productsData, error: productsError }
      ] = await Promise.all([
        // Productos en funnel: is_vetted = false, is_offered = false, is_sourced = false
        supabase
          .from('research_products')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_vetted', false)
          .eq('is_offered', false)
          .eq('is_sourced', false),
        
        // Productos vetted: is_vetted = true
        supabase
          .from('research_products')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_vetted', true),
        
        // Productos offered: is_offered = true
        supabase
          .from('research_products')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_offered', true),
        
        // Productos sourced: is_sourced = true
        supabase
          .from('research_products')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_sourced', true),
        
        // Obtener todos los registros del usuario
        supabase
          .from('research_products')
          .select('asin')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
      ]);

      // Verificar errores
      if (inFunnelError) throw inFunnelError;
      if (vettedError) throw vettedError;
      if (offeredError) throw offeredError;
      if (sourcedError) throw sourcedError;
      if (productsError) throw productsError;

      setProductsInFunnel(inFunnelCount || 0);
      setProductsVetted(vettedCount || 0);
      setProductsOffered(offeredCount || 0);
      setProductsSourced(sourcedCount || 0);
      setProducts(productsData || []);
    } catch (err) {
      console.error('Error fetching product funnel stats:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch stats');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (updateProducts) {
      console.log('Updating products stats');
      fetchStats();
      setUpdateProducts(false);
    }
  }, [updateProducts]);

  useEffect(() => {
    fetchStats();
  }, [user?.id]);

  return {
    productsInFunnel,
    productsVetted,
    productsOffered,
    productsSourced,
    products,
    loading,
    error,
    setUpdateProducts,
  };
};

