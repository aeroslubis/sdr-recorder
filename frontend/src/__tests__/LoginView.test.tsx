import { render, screen, fireEvent, act } from '@testing-library/react';
import { LoginView } from '../components/LoginView';

describe('LoginView Component', () => {
  test('renders login view with empty credentials and clean sign in button without arrow', () => {
    render(<LoginView onLogin={jest.fn()} />);
    expect(screen.queryByText(/Default credentials/i)).not.toBeInTheDocument();
    expect(screen.getByText(/RECORDER/i)).toBeInTheDocument();
    expect(screen.getByText(/Continuous Radio Monitoring & Archiving System/i)).toBeInTheDocument();
    
    const submitButton = screen.getByRole('button', { name: /sign in/i });
    expect(submitButton).toBeInTheDocument();
    expect(submitButton.textContent).toBe('Sign In');
    expect(submitButton.textContent).not.toContain('->');

    const usernameInput = screen.getByLabelText(/username/i) as HTMLInputElement;
    const passwordInput = screen.getByLabelText(/password/i) as HTMLInputElement;
    expect(usernameInput.value).toBe('');
    expect(passwordInput.value).toBe('');
  });

  test('submits form with entered username and password', async () => {
    const handleLogin = jest.fn();
    render(<LoginView onLogin={handleLogin} />);

    const usernameInput = screen.getByLabelText(/username/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    await act(async () => {
      fireEvent.change(usernameInput, { target: { value: 'admin' } });
      fireEvent.change(passwordInput, { target: { value: '12345' } });
      fireEvent.click(submitButton);
    });

    expect(handleLogin).toHaveBeenCalledWith('admin', '12345', false);
  });

  test('exposes browser password-manager form attributes and unchecked Remember me by default', () => {
    const { container } = render(<LoginView onLogin={jest.fn()} />);
    const form = container.querySelector('form') as HTMLFormElement;
    expect(form.getAttribute('method')).toBe('post');

    const usernameInput = screen.getByLabelText(/username/i) as HTMLInputElement;
    const passwordInput = screen.getByLabelText(/password/i) as HTMLInputElement;
    expect(usernameInput.getAttribute('name')).toBe('username');
    expect(passwordInput.getAttribute('name')).toBe('password');

    const rememberCheckbox = screen.getByLabelText(/remember me/i) as HTMLInputElement;
    expect(rememberCheckbox.type).toBe('checkbox');
    expect(rememberCheckbox.checked).toBe(false);
  });

  test('passes rememberMe=true when Remember me checkbox is checked', async () => {
    const handleLogin = jest.fn();
    render(<LoginView onLogin={handleLogin} />);

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'admin' } });
      fireEvent.change(screen.getByLabelText(/password/i), { target: { value: '12345' } });
      fireEvent.click(screen.getByLabelText(/remember me/i));
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    });

    expect(handleLogin).toHaveBeenCalledWith('admin', '12345', true);
  });

  test('displays error message when error is provided', () => {
    render(<LoginView onLogin={jest.fn()} error="Invalid username or password" />);
    expect(screen.getByText('Invalid username or password')).toBeInTheDocument();
  });
});
