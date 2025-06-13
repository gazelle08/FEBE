// Pastikan file ini ada di jalur '../JavaScript/supabaseClient.js'
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tsiupinydlljbyrheozq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzaXVwaW55ZGxsamJ5cmhlb3pxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk3MDUwMDcsImV4cCI6MjA2NTI4MTAwN30.gfGG-Hui-i_U0Y4yJDzJ2cGpiT_5O-LtfsoRNpth9y8';

export const supabase = createClient(supabaseUrl, supabaseKey);

console.log('Supabase client initialized.');