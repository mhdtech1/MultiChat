import { FormEvent, useState } from "react";

type ComposerProps = {
  onSend: (message: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

export function Composer({ onSend, placeholder, disabled }: ComposerProps) {
  const [value, setValue] = useState("");

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const message = value.trim();
    if (!message) return;
    onSend(message);
    setValue("");
  };

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <div className="composer__input-wrapper">
        <input
          className="composer__input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder ?? "Type a message"}
          disabled={disabled}
        />
      </div>
      <div className="composer__actions">
        <button className="composer__button composer__send" type="submit" disabled={disabled || !value.trim()}>
          Send
        </button>
      </div>
    </form>
  );
}
