import { render, screen, fireEvent, act } from '@testing-library/react';
import { LoginView } from '../components/LoginView';

describe('LoginView Component', () => {
  test('renders login view with default credentials hint in english', () => {
    render(<LoginView onLogin={jest.fn()} />);
    expect(screen.getByText(/Default credentials: admin \/ 12345/i)).toBeInTheDocument();
    expect(screen.getByText(/RECORDER/i)).toBeInTheDocument();
    expect(screen.getByText(/Continuous Radio Monitoring & Archiving System/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
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

    expect(handleLogin).toHaveBeenCalledWith('admin', '12345');
  });

  test('displays error message when error is provided', () => {
    render(<LoginView onLogin={jest.fn()} error="Invalid username or password" />);
    expect(screen.getByText('Invalid username or password')).toBeInTheDocument();
  });
});
