import { useState } from 'react';
import type { ScreenProps } from '../AdminApp';
import { Button, Screen, Tabs } from '../ui';
import { Brands, LogoStrip } from './Catalogue';

export default function BrandsScreen({ param, go }: ScreenProps) {
  const [tab, setTab] = useState('brands');
  return (
    <Screen
      title="Brands"
      intro="Step 2 of setting up the shop. The makers of the products you sell, like Aashirvaad or Haldiram’s."
      guide={<ol>
        <li>Add each brand you sell, with its logo.</li>
        <li>Tick <b>Show in the shop’s brand filter</b> for the brands shoppers look for most.</li>
        <li>The <b>Logo strip</b> tab chooses the brand logos that scroll across the homepage, in order.</li>
        <li>Next: add your <b>products</b> (step 3). Loose fruit and veg can have no brand.</li>
      </ol>}
      actions={<><Button onClick={() => go('categories')}>‹ Categories</Button><Button onClick={() => go('products')}>Next: Products ›</Button></>}
    >
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'brands', label: 'Brands' }, { value: 'strip', label: 'Logo strip on the homepage' }]} />
      {tab === 'brands' ? <Brands key={param ?? ''} initialQ={param ?? ''} /> : <LogoStrip />}
    </Screen>
  );
}
