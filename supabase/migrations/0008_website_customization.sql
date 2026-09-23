-- Public website customization: cover image and accent color
alter table businesses
  add column cover_image_url text,
  add column accent_color text check (accent_color ~ '^#[0-9a-fA-F]{6}$');
