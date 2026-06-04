import React from 'react';
import { IconCheck } from './icons/Icons';

interface CheckboxProps {
  checked: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  name: string;
}

export function Checkbox({ checked, onChange, name }: CheckboxProps) {
  const id = `${name.replace(/\s+/g, '-').toLowerCase()}-checkbox`;
  return (
    <label htmlFor={id} className="ln-checkbox">
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={onChange}
      />
      <span className="ln-checkbox-box">
        <IconCheck size={10} color="white" />
      </span>
      <span>{name}</span>
    </label>
  );
}

export default Checkbox;