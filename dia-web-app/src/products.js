'use strict';

const PRODUCTS = [
  {
    id: 'essential-hoodie',
    name: 'Essential Hoodie',
    category: 'Tops',
    price: 1890,
    tag: 'Bestseller',
    color: 'Forest',
    sizes: ['S', 'M', 'L', 'XL'],
    image: 'https://images.unsplash.com/photo-1753719734459-91c8cfcc1c3d?auto=format&fit=crop&w=1200&q=82',
    description: 'A relaxed, heavyweight layer designed for repeat wear. Soft brushed fleece, an easy dropped shoulder, and a small signature sparkle.'
  },
  {
    id: 'everyday-tee',
    name: 'Everyday Tee',
    category: 'Tops',
    price: 890,
    tag: 'New arrival',
    color: 'Oat',
    sizes: ['S', 'M', 'L', 'XL'],
    image: 'https://images.unsplash.com/photo-1768825099647-4fb34a87f590?auto=format&fit=crop&w=1200&q=82',
    description: 'A clean-cut cotton tee in a warm oat shade. Made to sit comfortably on its own or layer under a hoodie.'
  },
  {
    id: 'core-cap',
    name: 'Core Cap',
    category: 'Headwear',
    price: 650,
    tag: 'Everyday staple',
    color: 'Washed black',
    sizes: ['One size'],
    image: 'https://images.unsplash.com/photo-1768825159293-222e85f3ec05?auto=format&fit=crop&w=1200&q=82',
    description: 'An understated six-panel cap with a curved brim and an embroidered sparkle.'
  },
  {
    id: 'weekend-layer',
    name: 'Weekend Layer',
    category: 'Tops',
    price: 1590,
    tag: 'Limited drop',
    color: 'Deep olive',
    sizes: ['S', 'M', 'L', 'XL'],
    image: '/assets/dia-editorial.webp',
    description: 'A roomy, slightly structured layer in signature deep olive. Minimal detailing lets the fabric and shape do the talking.'
  }
];

module.exports = { PRODUCTS };
