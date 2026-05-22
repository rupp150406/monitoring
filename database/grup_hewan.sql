create table public.grup_hewan (
  id_grup character varying(50) not null,
  jenis_hewan character varying(20) not null,
  label_tampilan character varying(100) not null,
  status_kedatangan character varying(20) null default 'Belum'::character varying,
  status_sembelihan character varying(20) null default 'Belum'::character varying,
  status_pengulitan character varying(20) null default 'Belum'::character varying,
  status_pengemasan character varying(20) null default 'Belum'::character varying,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  constraint grup_hewan_pkey primary key (id_grup),
  constraint grup_hewan_status_kedatangan_check check (
    (
      (status_kedatangan)::text = any (
        (
          array[
            'Belum'::character varying,
            'Proses'::character varying,
            'Selesai'::character varying
          ]
        )::text[]
      )
    )
  ),
  constraint grup_hewan_status_pengemasan_check check (
    (
      (status_pengemasan)::text = any (
        (
          array[
            'Belum'::character varying,
            'Proses'::character varying,
            'Selesai'::character varying
          ]
        )::text[]
      )
    )
  ),
  constraint grup_hewan_status_pengulitan_check check (
    (
      (status_pengulitan)::text = any (
        (
          array[
            'Belum'::character varying,
            'Proses'::character varying,
            'Selesai'::character varying
          ]
        )::text[]
      )
    )
  ),
  constraint grup_hewan_status_sembelihan_check check (
    (
      (status_sembelihan)::text = any (
        (
          array[
            'Belum'::character varying,
            'Proses'::character varying,
            'Selesai'::character varying
          ]
        )::text[]
      )
    )
  )
) TABLESPACE pg_default;