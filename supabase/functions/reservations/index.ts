import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface ReservationRequest {
  slot_id: string;
  expires_in_minutes?: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization')!;

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const url = new URL(req.url);
    const path = url.pathname;

    if (path.endsWith('/create') && req.method === 'POST') {
      const body: ReservationRequest = await req.json();
      const { slot_id, expires_in_minutes = 15 } = body;

      if (!slot_id) {
        return new Response(
          JSON.stringify({ error: 'slot_id is required' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const { data: slot, error: slotError } = await supabase
        .from('parking_slots')
        .select('id, status')
        .eq('id', slot_id)
        .maybeSingle();

      if (slotError || !slot) {
        return new Response(
          JSON.stringify({ error: 'Slot not found' }),
          {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      if (slot.status !== 'available') {
        return new Response(
          JSON.stringify({ error: `Slot is ${slot.status}` }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + expires_in_minutes);

      const { data: reservation, error: reservationError } = await supabase
        .from('reservations')
        .insert({
          slot_id,
          driver_id: user.id,
          expires_at: expiresAt.toISOString(),
        })
        .select()
        .single();

      if (reservationError) {
        return new Response(
          JSON.stringify({ error: reservationError.message }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      await supabase
        .from('parking_slots')
        .update({ status: 'reserved' })
        .eq('id', slot_id);

      return new Response(
        JSON.stringify({ data: reservation }),
        {
          status: 201,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (path.includes('/cancel/') && req.method === 'POST') {
      const reservationId = path.split('/cancel/')[1];

      const { data: reservation, error: fetchError } = await supabase
        .from('reservations')
        .select('id, slot_id, driver_id, status')
        .eq('id', reservationId)
        .maybeSingle();

      if (fetchError || !reservation) {
        return new Response(
          JSON.stringify({ error: 'Reservation not found' }),
          {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      if (reservation.driver_id !== user.id) {
        return new Response(
          JSON.stringify({ error: 'Not authorized to cancel this reservation' }),
          {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      if (reservation.status !== 'active') {
        return new Response(
          JSON.stringify({ error: 'Can only cancel active reservations' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const { error: updateError } = await supabase
        .from('reservations')
        .update({ status: 'cancelled' })
        .eq('id', reservationId);

      if (updateError) {
        return new Response(
          JSON.stringify({ error: updateError.message }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      await supabase
        .from('parking_slots')
        .update({ status: 'available' })
        .eq('id', reservation.slot_id);

      return new Response(
        JSON.stringify({ message: 'Reservation cancelled' }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Not found' }),
      {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});