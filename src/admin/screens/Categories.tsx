import type { ScreenProps } from '../AdminApp';
import { Button, Screen } from '../ui';
import { Categories } from './Catalogue';

export default function CategoriesScreen({ param, go }: ScreenProps) {
  return (
    <Screen
      title="Categories"
      intro="Step 1 of setting up the shop. Categories are the aisles shoppers browse, like Rice or Spices & Masala."
      guide={<ol>
        <li>Add your main categories first (for example <b>Rice</b>, <b>Atta &amp; Flours</b>).</li>
        <li>Add smaller ones <b>inside</b> them if you need to (for example Basmati inside Rice).</li>
        <li>Use the arrows to put them in the order you want in the shop menu. Give each one a picture.</li>
        <li>Next: add your <b>brands</b> (step 2), then your <b>products</b> (step 3).</li>
      </ol>}
      actions={<Button onClick={() => go('brands')}>Next: Brands ›</Button>}
    >
      <Categories key={param ?? ''} initialQ={param ?? ''} />
    </Screen>
  );
}
